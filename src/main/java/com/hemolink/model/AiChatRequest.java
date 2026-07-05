package com.hemolink.model;

import java.util.List;

public record AiChatRequest(
        String prompt,
        String system,
        List<AiChatMessage> messages) {
}
