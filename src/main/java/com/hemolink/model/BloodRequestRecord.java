package com.hemolink.model;

public record BloodRequestRecord(
        String id,
        String hospitalId,
        String bloodType,
        int quantity,
        String urgency,
        String status,
        String notes,
        String createdAt,
        String fulfilledAt) {
}
