package com.hemolink.security;

import com.hemolink.model.UserRecord;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey secretKey;
    private final long expirationHours;

    public JwtService(
            @Value("${hemolink.jwt.secret}") String secret,
            @Value("${hemolink.jwt.expiration-hours:24}") long expirationHours) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("hemolink.jwt.secret must be at least 32 characters");
        }
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationHours = expirationHours;
    }

    public String generateToken(UserRecord user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.id())
                .claim("email", user.email())
                .claim("role", user.role())
                .claim("hospitalId", user.hospitalId())
                .claim("name", user.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(expirationHours * 3600)))
                .signWith(secretKey)
                .compact();
    }

    public AuthUser parseToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new AuthUser(
                claims.getSubject(),
                claims.get("email", String.class),
                claims.get("role", String.class),
                claims.get("hospitalId", String.class),
                claims.get("name", String.class)
        );
    }
}
