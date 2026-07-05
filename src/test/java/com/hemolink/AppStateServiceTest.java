package com.hemolink;

import com.hemolink.model.LoginRequest;
import com.hemolink.service.AppStateService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
class AppStateServiceTest {

    @Autowired
    private AppStateService appStateService;

    @Test
    void loginAcceptsDemoAdminCredentials() {
        var response = appStateService.login(new LoginRequest("admin@hemolink.in", "admin123"));
        assertEquals("admin", response.user().role());
        assertEquals("System Admin", response.user().name());
        assert response.token() != null && !response.token().isBlank();
    }

    @Test
    void loginRejectsInvalidPassword() {
        assertThrows(ResponseStatusException.class,
                () -> appStateService.login(new LoginRequest("admin@hemolink.in", "wrong-password")));
    }
}
