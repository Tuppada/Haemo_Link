package com.hemolink.model;

public record DonorRecord(
        String id,
        String userId,
        String name,
        String email,
        String bloodType,
        String phone,
        String dob,
        String lastDonation,
        boolean medicalClearance,
        String address,
        String emergencyContact,
        String status) {
}
