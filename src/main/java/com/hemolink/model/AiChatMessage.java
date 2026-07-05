package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;

public record AiChatMessage(
        @NotBlank String role,
        @NotBlank String content) {
}
