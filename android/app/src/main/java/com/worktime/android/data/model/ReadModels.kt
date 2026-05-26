package com.worktime.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DashboardResponse(
    @SerialName("as_of") val asOf: String,
    val identity: Identity,
    @SerialName("work_context") val workContext: WorkContext,
    @SerialName("current_status") val currentStatus: CurrentStatus,
    @SerialName("next_shifts") val nextShifts: NextShifts,
    @SerialName("team_status") val teamStatus: TeamStatus,
    @SerialName("time_off_summary") val timeOffSummary: TimeOffSummary,
)

@Serializable
data class Identity(
    val id: Int,
    val username: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("is_admin") val isAdmin: Boolean,
)

@Serializable
data class FeatureFlags(
    @SerialName("time_off_enabled") val timeOffEnabled: Boolean,
)

@Serializable
data class WorkContext(
    @SerialName("schedule_type") val scheduleType: String? = null,
    @SerialName("team_number") val teamNumber: Int? = null,
    @SerialName("effective_team_number") val effectiveTeamNumber: Int? = null,
    val state: String,
    @SerialName("feature_flags") val featureFlags: FeatureFlags,
)

@Serializable
data class ShiftSummary(
    val code: String,
    @SerialName("display_code") val displayCode: String,
    val name: String,
    @SerialName("start_hour") val startHour: Double? = null,
    @SerialName("end_hour") val endHour: Double? = null,
    @SerialName("is_working") val isWorking: Boolean,
)

@Serializable
data class TeamShiftStatus(
    @SerialName("team_number") val teamNumber: Int,
    val date: String,
    @SerialName("shift_day") val shiftDay: String,
    @SerialName("shift_code") val shiftCode: String,
    val shift: ShiftSummary,
    @SerialName("is_currently_working") val isCurrentlyWorking: Boolean,
)

@Serializable
data class OffDayProgress(
    val current: Int,
    val total: Int,
)

@Serializable
data class CurrentStatus(
    @SerialName("as_of") val asOf: String,
    @SerialName("current_shift") val currentShift: TeamShiftStatus? = null,
    @SerialName("currently_working_team") val currentlyWorkingTeam: TeamShiftStatus? = null,
    @SerialName("off_day_progress") val offDayProgress: OffDayProgress? = null,
)

@Serializable
data class NextShiftItem(
    @SerialName("team_number") val teamNumber: Int,
    val date: String,
    @SerialName("shift_code") val shiftCode: String,
    val shift: ShiftSummary,
)

@Serializable
data class NextShifts(
    @SerialName("as_of") val asOf: String,
    val items: List<NextShiftItem>,
)

@Serializable
data class TeamStatus(
    @SerialName("as_of") val asOf: String,
    val items: List<TeamShiftStatus>,
)

@Serializable
data class TimeOffSummaryItem(
    @SerialName("entry_id") val entryId: String,
    @SerialName("entry_kind") val entryKind: String,
    @SerialName("entry_type") val entryType: String,
    @SerialName("entry_flag") val entryFlag: String,
    val note: String? = null,
    @SerialName("starts_on") val startsOn: String,
    @SerialName("ends_on") val endsOn: String,
    @SerialName("is_recurring_weekly") val isRecurringWeekly: Boolean,
    @SerialName("is_active") val isActive: Boolean,
)

@Serializable
data class TimeOffSummary(
    @SerialName("as_of") val asOf: String,
    @SerialName("active_items") val activeItems: List<TimeOffSummaryItem>,
    @SerialName("upcoming_items") val upcomingItems: List<TimeOffSummaryItem>,
    @SerialName("total_upcoming") val totalUpcoming: Int,
)
