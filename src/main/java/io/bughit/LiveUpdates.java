package io.bughit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Configuration @EnableWebSocket
class LiveConfig implements WebSocketConfigurer {
    private final LiveUpdates handler;
    private final String devOrigin;
    LiveConfig(LiveUpdates handler, @Value("${bughit.live-origin}") String devOrigin) { this.handler = handler; this.devOrigin = devOrigin; }

    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var endpoint = registry.addHandler(handler, "/ws/connect");
        if (!devOrigin.isBlank()) endpoint.setAllowedOrigins(devOrigin);
    }
}

@Component
class LiveUpdates extends TextWebSocketHandler {
    private record Subscriber(WebSocketSession socket, long project, long user, UUID session) {}
    private final ConcurrentHashMap<String, Subscriber> subscribers = new ConcurrentHashMap<>();
    private final JwtDecoder decoder;
    private final Workspace workspace;
    private final Members members;
    private final Sessions sessions;
    private final ObjectMapper mapper;

    LiveUpdates(JwtDecoder decoder, Workspace workspace, Members members, Sessions sessions, ObjectMapper mapper) {
        this.decoder = decoder; this.workspace = workspace; this.members = members; this.sessions = sessions; this.mapper = mapper;
    }

    @Override public void afterConnectionEstablished(WebSocketSession socket) { socket.setTextMessageSizeLimit(4096); }

    @Override protected void handleTextMessage(WebSocketSession socket, TextMessage text) throws IOException {
        if (subscribers.containsKey(socket.getId())) return;
        try {
            var message = mapper.readTree(text.getPayload());
            if (!message.path("projectId").canConvertToLong() || !message.path("token").isTextual()) throw new IllegalArgumentException();
            long project = message.get("projectId").asLong();
            var token = decoder.decode(message.get("token").asText());
            long user = AuthService.id(token);
            workspace.role(project, user);
            var safe = new ConcurrentWebSocketSessionDecorator(socket, 1500, 8192);
            subscribers.put(socket.getId(), new Subscriber(safe, project, user, UUID.fromString(token.getId())));
            safe.sendMessage(new TextMessage("ready"));
        } catch (RuntimeException | IOException invalid) {
            subscribers.remove(socket.getId());
            socket.close(CloseStatus.POLICY_VIOLATION);
        }
    }

    @Override public void afterConnectionClosed(WebSocketSession socket, CloseStatus status) { subscribers.remove(socket.getId()); }

    @TransactionalEventListener
    public void notifyBoard(ProjectChanged event) {
        subscribers.forEach((id, subscriber) -> {
            if (subscriber.project != event.projectId()) return;
            var socket = subscriber.socket;
            try {
                if (socket.isOpen() && sessions.existsByIdAndAccountIdAndExpiresAtAfter(subscriber.session, subscriber.user, Instant.now())
                        && members.findByProjectIdAndAccountId(subscriber.project, subscriber.user).isPresent()) {
                    socket.sendMessage(new TextMessage("refresh"));
                } else {
                    subscribers.remove(id);
                    if (socket.isOpen()) socket.close(CloseStatus.POLICY_VIOLATION);
                }
            } catch (IOException | RuntimeException unavailable) { subscribers.remove(id); }
        });
    }
}
