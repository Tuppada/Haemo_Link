package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;

public record RegisterDonorRequest(
        @NotBlank String name,
        @NotBlank String email,
        @NotBlank String password,
        @NotBlank String bloodType,
        @NotBlank String phone,
        @NotBlank String dob,
        String address,
        String lastDonation,
        String emergencyContact) {
}
