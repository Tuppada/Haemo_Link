package com.hemolink.model;

import java.util.List;

public record AppState(
        List<DonorRecord> donors,
        List<Hospital> hospitals,
        List<InventoryUnit> inventory,
        List<BloodRequestRecord> requests,
        List<ActivityLogRecord> activityLog,
        List<OrganDonorRecord> organDonors,
        List<AppointmentRecord> appointments,
        List<BloodCapacityRecord> bloodCapacities
) {}
