package com.hemolink.model;

public record BloodCapacityRecord(
        String hospitalId,
        String bloodType,
        int targetUnits) {
}
