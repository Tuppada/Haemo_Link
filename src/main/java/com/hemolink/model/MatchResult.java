package com.hemolink.model;

import java.util.List;

public record MatchResult(
        Hospital hospital,
        int distance,
        boolean canFulfill,
        int totalMatches,
        List<InventoryUnit> matches) {
}
