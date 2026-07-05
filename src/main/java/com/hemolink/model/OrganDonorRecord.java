package com.hemolink.model;

import java.util.List;

public record OrganDonorRecord(
        String id,
        String donorId,
        String name,
        String bloodType,
        String phone,
        List<String> organs,
        String hospitalId,
        String registeredAt,
        String status,
        String notes
) {}
