package com.hemolink.service;

import com.hemolink.model.AiChatMessage;
import com.hemolink.model.AiChatResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

@Service
public class AnthropicService {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${anthropic.api.key:}")
    private String apiKey;

    @Value("${anthropic.model:claude-haiku-4-5-20251001}")
    private String model;

    private static final String SYSTEM_PROMPT =
        "You are HaemoLink AI, a blood bank management assistant for Indian hospitals. " +
        "You help with blood compatibility rules, donor eligibility (56-day rule), " +
        "organ donation information, emergency routing, and inventory management. " +
        "Keep answers concise, medically accurate, and operationally useful. " +
        "Always be encouraging to donors and professional to hospital staff.";

    public AiChatResponse chat(String prompt, String system, List<AiChatMessage> messages) {
        String fallbackSeed = resolveFallbackSeed(prompt, messages);
        if (apiKey == null || apiKey.isBlank()) {
            return new AiChatResponse(getFallbackResponse(fallbackSeed));
        }

        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("max_tokens", 500);
            body.put("system", system != null && !system.isBlank() ? system : SYSTEM_PROMPT);

            ArrayNode messageArray = body.putArray("messages");
            if (messages != null && !messages.isEmpty()) {
                for (AiChatMessage message : messages) {
                    ObjectNode msg = objectMapper.createObjectNode();
                    msg.put("role", "assistant".equalsIgnoreCase(message.role()) ? "assistant" : "user");
                    msg.put("content", message.content());
                    messageArray.add(msg);
                }
            } else if (prompt != null && !prompt.isBlank()) {
                ObjectNode userMsg = objectMapper.createObjectNode();
                userMsg.put("role", "user");
                userMsg.put("content", prompt);
                messageArray.add(userMsg);
            } else {
                return new AiChatResponse(getFallbackResponse(fallbackSeed));
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.anthropic.com/v1/messages"))
                    .timeout(Duration.ofSeconds(30))
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 529 || response.statusCode() == 503) {
                return new AiChatResponse("AI is temporarily overloaded. Please try again in a moment.\n\n" +
                        getFallbackResponse(fallbackSeed));
            }

            if (response.statusCode() >= 400) {
                String errMsg = "Unknown error";
                try {
                    JsonNode err = objectMapper.readTree(response.body());
                    errMsg = err.path("error").path("message").asText(errMsg);
                } catch (IOException ignored) {
                    // use default message
                }
                if (errMsg.contains("credit") || errMsg.contains("balance") || errMsg.contains("authentication")) {
                    return new AiChatResponse(getFallbackResponse(fallbackSeed));
                }
                return new AiChatResponse(getFallbackResponse(fallbackSeed) +
                        "\n\n_(Live AI unavailable: " + errMsg + ")_");
            }

            JsonNode json = objectMapper.readTree(response.body());
            JsonNode content = json.path("content");
            if (content.isArray() && !content.isEmpty()) {
                return new AiChatResponse(content.get(0).path("text").asText());
            }

            return new AiChatResponse(getFallbackResponse(fallbackSeed));

        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return new AiChatResponse(getFallbackResponse(fallbackSeed));
        } catch (IOException ex) {
            return new AiChatResponse(getFallbackResponse(fallbackSeed));
        }
    }

    private String resolveFallbackSeed(String prompt, List<AiChatMessage> messages) {
        if (prompt != null && !prompt.isBlank()) {
            return prompt;
        }
        if (messages != null && !messages.isEmpty()) {
            for (int i = messages.size() - 1; i >= 0; i--) {
                AiChatMessage message = messages.get(i);
                if ("user".equalsIgnoreCase(message.role()) && message.content() != null && !message.content().isBlank()) {
                    return message.content();
                }
            }
            return messages.get(messages.size() - 1).content();
        }
        return "";
    }

    private String getFallbackResponse(String prompt) {
        String lower = prompt == null ? "" : prompt.toLowerCase();
        if (lower.contains("hello") || lower.contains("hi") || lower.contains("hey")) {
            return "Hello! I am HaemoLink AI. I can help with blood compatibility, donor eligibility, organ donation info, and emergency routing. What do you need?";
        }
        if (lower.contains("compatible") || lower.contains("compatibility") || lower.contains("blood type")) {
            return "Blood Compatibility:\n• O- = Universal donor (gives to all, receives only O-)\n• AB+ = Universal recipient (receives from all)\n• A+ receives: O-, O+, A-, A+\n• B+ receives: O-, O+, B-, B+\n• 56-day minimum gap between donations.";
        }
        if (lower.contains("organ") || lower.contains("transplant") || lower.contains("donate organ")) {
            return "Organ Donation Info:\n• One donor can save up to 8 lives\n• Blood type compatibility required for most organs\n• Organs that can be donated: Kidney, Liver, Heart, Lungs, Pancreas, Cornea, Bone Marrow\n• Register in the Organ Registry tab to pledge.";
        }
        if (lower.contains("eligib") || lower.contains("donate") || lower.contains("56")) {
            return "Donor Eligibility Rules:\n• Age: 18–65 years\n• Weight: Minimum 45 kg\n• Must wait 56 days (8 weeks) between whole blood donations\n• No active infections or antibiotics\n• Haemoglobin ≥ 12.5 g/dL for women, ≥ 13 g/dL for men";
        }
        if (lower.contains("dijkstra") || lower.contains("nearest") || lower.contains("routing") || lower.contains("emergency") || lower.contains("sos")
                || lower.contains("hospital") && (lower.contains("blood") || lower.contains("unit") || lower.contains("stock") || lower.contains("available"))) {
            return "To find the nearest hospital with available blood:\n1. Click the red **SOS** button (bottom-right)\n2. Select blood type and quantity\n3. View ranked hospitals with distance (km) and unit counts\n\nOr use **Request Blood** — if your hospital lacks stock, Dijkstra routing runs automatically.\n\nCheck your stock: **Dashboard** → **My Blood Stock** chart, or **Inventory** tab.";
        }
        return "I am HaemoLink AI. I can help with:\n• Blood compatibility rules\n• Donor eligibility (56-day rule)\n• Organ donation registration\n• Emergency blood routing\n• Inventory management\n\nAsk me anything! (Tip: set ANTHROPIC_API_KEY for live Claude responses.)";
    }
}
