package com.hemolink.model;

public record ActivityLogRecord(
        String id,
        String time,
        String msg,
        String type) {
}
