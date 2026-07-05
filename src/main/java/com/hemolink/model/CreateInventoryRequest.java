package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;

public record CreateInventoryRequest(
        @NotBlank String bloodType,
        @NotBlank String collectionDate,
        @NotBlank String expiryDate,
        @NotBlank String hospitalId) {
}
