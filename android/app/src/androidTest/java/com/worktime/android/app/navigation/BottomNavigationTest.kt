package com.worktime.android.app.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.worktime.android.app.WorktimeBottomBar
import org.junit.Rule
import org.junit.Test

/**
 * Exercises the same bottom-nav wiring [com.worktime.android.app.WorktimeApp] uses
 * (launchSingleTop + restoreState/saveState around a [NavHost] keyed by [WorktimeDestination]),
 * without requiring the full authenticated app graph (session/DI/network).
 */
class BottomNavigationTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun renderScaffold() {
        composeTestRule.setContent {
            val navController = rememberNavController()
            val destinations = remember { WorktimeDestination.entries.toList() }
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentRoute = backStackEntry?.destination?.route ?: WorktimeDestination.Today.route

            Scaffold(
                bottomBar = {
                    WorktimeBottomBar(destinations, currentRoute) { route ->
                        navController.navigate(route) {
                            launchSingleTop = true
                            restoreState = true
                            popUpTo(navController.graph.startDestinationId) {
                                saveState = true
                            }
                        }
                    }
                }
            ) { paddingValues ->
                NavHost(
                    navController = navController,
                    startDestination = WorktimeDestination.Today.route,
                    modifier = Modifier.fillMaxSize()
                ) {
                    destinations.forEach { destination ->
                        composable(destination.route) {
                            var text by rememberSaveable { mutableStateOf("") }
                            Text("${destination.label} screen", modifier = Modifier.padding(paddingValues))
                            OutlinedTextField(value = text, onValueChange = { text = it }, label = { Text("Note") })
                        }
                    }
                }
            }
        }
    }

    @Test
    fun eachDestination_hasANavigationItemWithAnAccessibleLabel() {
        renderScaffold()

        WorktimeDestination.entries.forEach { destination ->
            composeTestRule.onNodeWithText(destination.label).assertIsDisplayed().assertHasClickAction()
        }
    }

    @Test
    fun navigationIcons_areDecorativeBecauseTheLabelNamesTheTab() {
        renderScaffold()

        WorktimeDestination.entries.forEach { destination ->
            // A description repeating the visible label would make TalkBack read every tab twice.
            composeTestRule
                .onAllNodesWithContentDescription(destination.label, useUnmergedTree = true)
                .assertCountEquals(0)
        }
    }

    @Test
    fun navigationItems_areTabsAndOnlyTheCurrentOneIsSelected() {
        renderScaffold()

        composeTestRule.onNodeWithText(WorktimeDestination.Today.label).assertIsSelected()
        composeTestRule.onNodeWithText(WorktimeDestination.NextShifts.label).assertIsNotSelected()
        composeTestRule
            .onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
            .assertCountEquals(WorktimeDestination.entries.size)
    }

    @Test
    fun tappingANavItem_switchesTheDisplayedScreen() {
        renderScaffold()

        composeTestRule.onNodeWithText("Today screen").assertIsDisplayed()

        composeTestRule.onNodeWithText(WorktimeDestination.Account.label).performClick()

        composeTestRule.onNodeWithText("Account screen").assertIsDisplayed()
    }

    @Test
    fun switchingAwayAndBack_restoresPerScreenState() {
        renderScaffold()

        composeTestRule.onNodeWithText("Note").performTextInput("draft note")

        composeTestRule.onNodeWithText(WorktimeDestination.NextShifts.label).performClick()
        composeTestRule.onNodeWithText("Next screen").assertIsDisplayed()

        composeTestRule.onNodeWithText(WorktimeDestination.Today.label).performClick()

        composeTestRule.onNodeWithText("draft note").assertIsDisplayed()
    }
}
