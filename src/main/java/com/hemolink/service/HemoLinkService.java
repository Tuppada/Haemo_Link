package com.hemolink.service;

import com.hemolink.model.BloodRequest;
import com.hemolink.model.Hospital;
import com.hemolink.model.InventoryUnit;
import com.hemolink.model.MatchResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class HemoLinkService {

    private static final Map<String, List<String>> COMPATIBILITY = Map.of(
            "A+", List.of("O-", "O+", "A-", "A+"),
            "A-", List.of("O-", "A-"),
            "B+", List.of("O-", "O+", "B-", "B+"),
            "B-", List.of("O-", "B-"),
            "AB+", List.of("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"),
            "AB-", List.of("O-", "A-", "B-", "AB-"),
            "O+", List.of("O-", "O+"),
            "O-", List.of("O-")
    );

    private final JdbcTemplate jdbcTemplate;

    public HemoLinkService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private Map<String, Map<String, Integer>> loadHospitalGraph() {
        Map<String, Map<String, Integer>> graph = new HashMap<>();
        jdbcTemplate.query(
                "select from_hospital_id, to_hospital_id, distance_km from hospital_edges",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> graph
                        .computeIfAbsent(rs.getString("from_hospital_id"), key -> new HashMap<>())
                        .put(rs.getString("to_hospital_id"), rs.getInt("distance_km")));
        return graph.isEmpty() ? defaultHospitalGraph() : graph;
    }

    private static Map<String, Map<String, Integer>> defaultHospitalGraph() {
        Map<String, Map<String, Integer>> graph = new HashMap<>();
        graph.put("h1", Map.of("h2", 5, "h3", 12, "h4", 8));
        graph.put("h2", Map.of("h1", 5, "h3", 7, "h5", 15));
        graph.put("h3", Map.of("h1", 12, "h2", 7, "h4", 3, "h5", 9));
        graph.put("h4", Map.of("h1", 8, "h3", 3, "h5", 6));
        graph.put("h5", Map.of("h2", 15, "h3", 9, "h4", 6));
        return graph;
    }

    public List<MatchResult> findNearestMatches(BloodRequest request) {
        return findNearestMatches(getDbHospitals(), getDbInventory(), request.hospitalId(), request.bloodType(), request.quantity());
    }

    public List<MatchResult> findNearestMatches(List<Hospital> hospitals, List<InventoryUnit> inventory, String hospitalId, String bloodType, int quantity) {
        Map<String, Integer> distances = dijkstra(hospitalId, loadHospitalGraph());

        return hospitals.stream()
                .filter(hospital -> !hospital.id().equals(hospitalId))
                .map(hospital -> {
                    MatchComputation match = matchRequest(inventory, bloodType, quantity, hospital.id());
                    if (!match.canFulfill()) {
                        return null;
                    }
                    return new MatchResult(hospital, distances.getOrDefault(hospital.id(), Integer.MAX_VALUE), true, match.total(), match.matches());
                })
                .filter(match -> match != null)
                .sorted(Comparator.comparingInt(MatchResult::distance))
                .toList();
    }

    public MatchComputation matchRequest(List<InventoryUnit> inventory, String bloodType, int quantity, String hospitalId) {
        LocalDate today = LocalDate.now();
        List<InventoryUnit> matches = inventory.stream()
                .filter(unit -> unit.hospitalId().equals(hospitalId))
                .filter(unit -> "Available".equalsIgnoreCase(unit.status()))
                .filter(unit -> !unit.expiryDate().isBefore(today))
                .filter(unit -> COMPATIBILITY.getOrDefault(bloodType, List.of(bloodType)).contains(unit.bloodType()))
                .sorted(Comparator.comparing(InventoryUnit::expiryDate))
                .limit(quantity)
                .toList();
        long total = inventory.stream()
                .filter(unit -> unit.hospitalId().equals(hospitalId))
                .filter(unit -> "Available".equalsIgnoreCase(unit.status()))
                .filter(unit -> !unit.expiryDate().isBefore(today))
                .filter(unit -> COMPATIBILITY.getOrDefault(bloodType, List.of(bloodType)).contains(unit.bloodType()))
                .count();
        return new MatchComputation(matches, total >= quantity, (int) total);
    }

    public long daysUntilEligible(LocalDate lastDonationDate) {
        long daysSince = ChronoUnit.DAYS.between(lastDonationDate, LocalDate.now());
        return Math.max(0, 56 - daysSince);
    }

    private List<Hospital> getDbHospitals() {
        return jdbcTemplate.query("select id, name, location, contact, phone from hospitals", (rs, rowNum) -> new Hospital(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("location"),
                rs.getString("contact"),
                rs.getString("phone")
        ));
    }

    private List<InventoryUnit> getDbInventory() {
        return jdbcTemplate.query("select * from inventory", (rs, rowNum) -> new InventoryUnit(
                rs.getString("id"),
                rs.getString("blood_type"),
                rs.getDate("collection_date").toLocalDate(),
                rs.getDate("expiry_date").toLocalDate(),
                rs.getString("status"),
                rs.getString("donor_id"),
                rs.getString("hospital_id")
        ));
    }

    private Map<String, Integer> dijkstra(String source, Map<String, Map<String, Integer>> graph) {
        Map<String, Integer> dist = new HashMap<>();
        Set<String> visited = new java.util.HashSet<>();
        graph.keySet().forEach(node -> dist.put(node, Integer.MAX_VALUE));
        dist.put(source, 0);

        while (visited.size() < graph.size()) {
            String current = dist.entrySet().stream()
                    .filter(entry -> !visited.contains(entry.getKey()))
                    .min(Map.Entry.comparingByValue())
                    .map(Map.Entry::getKey)
                    .orElse(null);

            if (current == null || dist.get(current) == Integer.MAX_VALUE) {
                break;
            }

            visited.add(current);
            graph.getOrDefault(current, Map.of()).forEach((neighbor, weight) -> {
                if (!dist.containsKey(neighbor)) {
                    dist.put(neighbor, Integer.MAX_VALUE);
                }
                int nextDistance = dist.get(current) + weight;
                if (nextDistance < dist.getOrDefault(neighbor, Integer.MAX_VALUE)) {
                    dist.put(neighbor, nextDistance);
                }
            });
        }

        return dist.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (left, right) -> left,
                        LinkedHashMap::new
                ));
    }

    public record MatchComputation(List<InventoryUnit> matches, boolean canFulfill, int total) {
    }
}
