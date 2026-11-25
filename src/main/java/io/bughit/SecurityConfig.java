package io.bughit;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import java.time.Instant;
import java.util.UUID;

@Configuration
@OpenAPIDefinition(info = @Info(title = "Bug Hit API", version = "1.0", description = "Project teams, tickets, comments, and Kanban workflow."))
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT")
class SecurityConfig {
    @Bean PasswordEncoder passwords() { return new BCryptPasswordEncoder(12); }

    @Bean JwtDecoder jwtDecoder(TokenKey key, Sessions sessions) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key.key).build();
        OAuth2TokenValidator<Jwt> active = jwt -> {
            try {
                if (sessions.existsByIdAndAccountIdAndExpiresAtAfter(UUID.fromString(jwt.getId()), Long.valueOf(jwt.getSubject()), Instant.now())) {
                    return OAuth2TokenValidatorResult.success();
                }
            } catch (IllegalArgumentException | NullPointerException ignored) { /* Invalid token claims. */ }
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Session expired or revoked.", null));
        };
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(TokenKey.ISSUER), active));
        return decoder;
    }

    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .headers(headers -> headers
                    .referrerPolicy(policy -> policy.policy(ReferrerPolicy.NO_REFERRER))
                    .contentSecurityPolicy(policy -> policy.policyDirectives("default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; "
                                + "form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:")))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(request -> request
                    .requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login").permitAll()
                    .requestMatchers("/api/**").authenticated()
                    .requestMatchers(HttpMethod.GET, "/", "/index.html", "/assets/**", "/bug-hit.svg", "/login",
                        "/projects/**", "/actuator/health", "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**", "/ws/connect").permitAll()
                    .requestMatchers("/error").permitAll().anyRequest().denyAll())
                .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults())).build();
    }
}
