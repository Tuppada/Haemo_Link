package com.hemolink.model;

public record AppointmentRecord(
        String id,
        String userId,
        String hospitalId,
        String donationType,
        String appointmentDate,
        String notes,
        String status,
        String bookedAt) {
}
