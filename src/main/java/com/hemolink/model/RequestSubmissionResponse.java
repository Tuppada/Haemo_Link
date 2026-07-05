package com.hemolink.model;

import java.util.List;

public record RequestSubmissionResponse(
        BloodRequestRecord request,
        boolean fulfilledLocally,
        List<MatchResult> nearby) {
}
