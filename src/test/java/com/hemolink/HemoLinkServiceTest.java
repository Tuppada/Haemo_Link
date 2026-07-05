package com.hemolink;

import com.hemolink.model.Hospital;
import com.hemolink.model.InventoryUnit;
import com.hemolink.service.HemoLinkService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class HemoLinkServiceTest {

    @Autowired
    private HemoLinkService hemoLinkService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void resetInventory() {
        jdbcTemplate.update("update inventory set status='Available' where id='inv1'");
    }

    @Test
    void matchRequestUsesOldestExpiryFirst() {
        LocalDate future = LocalDate.now().plusMonths(3);
        List<InventoryUnit> inventory = List.of(
                new InventoryUnit("a", "O-", LocalDate.now(), future.plusMonths(1), "Available", null, "h1"),
                new InventoryUnit("b", "O-", LocalDate.now(), future, "Available", null, "h1")
        );

        var result = hemoLinkService.matchRequest(inventory, "O-", 1, "h1");

        assertTrue(result.canFulfill());
        assertEquals("b", result.matches().get(0).id());
    }

    @Test
    void findNearestMatchesSortsByDistance() {
        LocalDate future = LocalDate.now().plusMonths(2);
        List<InventoryUnit> inventory = List.of(
                new InventoryUnit("test-b", "B+", LocalDate.now(), future, "Available", null, "h2")
        );
        var matches = hemoLinkService.findNearestMatches(
                List.of(new Hospital("h1", "A", "Loc", "C", "1"),
                        new Hospital("h2", "B", "Loc", "C", "2")),
                inventory,
                "h1",
                "B+",
                1
        );

        assertTrue(matches.size() >= 1);
        assertEquals("h2", matches.get(0).hospital().id());
    }
}
