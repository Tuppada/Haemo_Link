package com.hemolink.model;

public record UserRecord(
        String id,
        String email,
        String role,
        String hospitalId,
        String name,
        String createdAt) {
}
