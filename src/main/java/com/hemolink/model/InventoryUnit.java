package com.hemolink.model;

import java.time.LocalDate;

public record InventoryUnit(
        String id,
        String bloodType,
        LocalDate collectionDate,
        LocalDate expiryDate,
        String status,
        String donorId,
        String hospitalId) {
}
