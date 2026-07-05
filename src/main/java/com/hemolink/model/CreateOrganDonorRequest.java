package com.hemolink.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record CreateOrganDonorRequest(
        @NotBlank String name,
        @NotBlank String bloodType,
        @NotBlank String phone,
        @NotEmpty List<String> organs,
        String hospitalId,
        String donorId,
        String notes
) {}
