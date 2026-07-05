package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;

public record CreateDonorRequest(
        @NotBlank String name,
        @NotBlank String bloodType,
        @NotBlank String phone,
        @NotBlank String email,
        String dob,
        String address,
        String lastDonation,
        String emergencyContact) {
}
