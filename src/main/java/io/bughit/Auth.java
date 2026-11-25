package io.bughit;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static io.bughit.ApiErrors.error;
import static io.bughit.ApiTypes.*;

@Component
class TokenKey {
    static final String ISSUER = "bug-hit";
    final SecretKey key;

    TokenKey(@Value("${bughit.jwt-secret}") String secret, Environment environment) throws Exception {
        if (secret.isBlank()) {
            if (environment.acceptsProfiles(Profiles.of("render"))) throw new IllegalStateException("JWT_SECRET is required on Render.");
            byte[] generated = new byte[32];
            new SecureRandom().nextBytes(generated);
            key = new SecretKeySpec(generated, "HmacSHA256");
        } else {
            if (secret.length() < 32) throw new IllegalArgumentException("JWT_SECRET must contain at least 32 characters.");
            key = new SecretKeySpec(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)), "HmacSHA256");
        }
    }

    String issue(long account, UUID session, Instant now, Instant expires) {
        var claims = new JWTClaimsSet.Builder().issuer(ISSUER).subject(Long.toString(account)).jwtID(session.toString())
                .issueTime(Date.from(now)).expirationTime(Date.from(expires)).build();
        var jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try { jwt.sign(new MACSigner(key.getEncoded())); }
        catch (JOSEException e) { throw new IllegalStateException("JWT signing failed", e); }
        return jwt.serialize();
    }
}

@Component
class AuthService {
    private final Accounts accounts;
    private final Sessions sessions;
    private final PasswordEncoder passwords;
    private final TokenKey key;
    private final String unknownPassword;

    AuthService(Accounts accounts, Sessions sessions, PasswordEncoder passwords, TokenKey key) {
        this.accounts = accounts; this.sessions = sessions; this.passwords = passwords; this.key = key;
        unknownPassword = passwords.encode(UUID.randomUUID().toString());
    }

    private static void checkBytes(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) throw error(HttpStatus.BAD_REQUEST, "Use a password of at most 72 UTF-8 bytes.");
    }

    static String email(String value) { return value.strip().toLowerCase(Locale.ROOT); }
    static UserView view(Account account) { return new UserView(account.id, account.name, account.email); }
    static long id(Jwt jwt) { return Long.parseLong(jwt.getSubject()); }

    @Transactional AccountSession signup(Signup request) {
        checkBytes(request.password());
        String address = email(request.email());
        if (accounts.findByEmail(address).isPresent()) throw error(HttpStatus.CONFLICT, "An account already uses that email.");
        Account account = accounts.saveAndFlush(new Account(address, request.name().strip(), passwords.encode(request.password())));
        return start(account);
    }

    @Transactional AccountSession login(Login request) {
        checkBytes(request.password());
        Account account = accounts.findByEmail(email(request.email())).orElse(null);
        if (!passwords.matches(request.password(), account == null ? unknownPassword : account.passwordHash) || account == null) {
            throw error(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        return start(account);
    }

    private AccountSession start(Account account) {
        Instant now = Instant.now();
        Instant end = now.plus(8, ChronoUnit.HOURS);
        UUID session = UUID.randomUUID();
        sessions.expire(now);
        sessions.save(new AuthSession(session, account.id, end));
        return new AccountSession(key.issue(account.id, session, now, end), view(account), end);
    }

    UserView identify(Jwt jwt) {
        return accounts.findById(id(jwt)).map(AuthService::view).orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Sign in again."));
    }

    @Transactional void logout(Jwt jwt) { sessions.deleteById(UUID.fromString(jwt.getId())); }
}

@RestController @RequestMapping("/api/auth")
class AuthController {
    private final AuthService auth;
    private final Map<String, Integer> attempts = new HashMap<>();
    private long currentMinute;
    private int globalAttempts;

    AuthController(AuthService auth) { this.auth = auth; }

    private synchronized void throttle(HttpServletRequest call, String address) {
        long minute = System.currentTimeMillis() / 60000;
        if (minute != currentMinute) { attempts.clear(); globalAttempts = 0; currentMinute = minute; }
        if (++globalAttempts > 180 || attempts.merge("ip:" + call.getRemoteAddr(), 1, Integer::sum) > 20
                || attempts.merge("email:" + AuthService.email(address), 1, Integer::sum) > 10) {
            throw error(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again in a minute.");
        }
    }

    @PostMapping("/signup") @ResponseStatus(HttpStatus.CREATED)
    AccountSession signup(@Valid @RequestBody Signup request, HttpServletRequest call) { throttle(call, request.email()); return auth.signup(request); }

    @PostMapping("/login")
    AccountSession login(@Valid @RequestBody Login request, HttpServletRequest call) { throttle(call, request.email()); return auth.login(request); }

    @GetMapping("/me") @SecurityRequirement(name = "bearerAuth")
    UserView me(@AuthenticationPrincipal Jwt jwt) { return auth.identify(jwt); }

    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) @SecurityRequirement(name = "bearerAuth")
    void logout(@AuthenticationPrincipal Jwt jwt) { auth.logout(jwt); }
}
