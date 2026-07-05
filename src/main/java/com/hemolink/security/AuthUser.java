package com.hemolink.security;

public record AuthUser(
        String id,
        String email,
        String role,
        String hospitalId,
        String name) {

    public boolean isAdmin() {
        return "admin".equalsIgnoreCase(role);
    }

    public boolean isHospital() {
        return "hospital".equalsIgnoreCase(role);
    }

    public boolean isDonor() {
        return "donor".equalsIgnoreCase(role);
    }
}
