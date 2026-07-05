package com.hemolink.model;

public record LoginResponse(
        UserRecord user,
        String token) {
}
