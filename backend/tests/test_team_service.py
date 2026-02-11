"""Tests for team models and service layer."""

from pathlib import Path

import pytest

from app.config.settings import settings
from app.models.hday import HdayEvent
from app.models.team import (
    TeamHdayResponse,
    TeamInfoResponse,
    TeamMember,
    TeamMemberHdayData,
)
from app.services.team_service import (
    TeamNotFoundError,
    get_team_path,
    read_team_config,
    read_team_hday_files,
    read_team_members,
)


@pytest.fixture
def share_dir(tmp_path, monkeypatch):
    """Create a temporary share directory for testing."""
    share = tmp_path / "share"
    share.mkdir()
    monkeypatch.setattr(settings, "SHARE_DIR", str(share))
    return share


class TestTeamModels:
    """Tests for team Pydantic models."""

    def test_team_member_creation(self):
        """Test TeamMember model creation."""
        member = TeamMember(username="jdoe", display_name="John Doe")

        assert member.username == "jdoe"
        assert member.display_name == "John Doe"

    def test_team_info_response_creation(self):
        """Test TeamInfoResponse model creation."""
        members = [
            TeamMember(username="jdoe", display_name="John Doe"),
            TeamMember(username="asmith", display_name="Alice Smith"),
        ]
        response = TeamInfoResponse(team_id="team1", name="Engineering", members=members)

        assert response.team_id == "team1"
        assert response.name == "Engineering"
        assert len(response.members) == 2
        assert response.members[0].username == "jdoe"

    def test_team_member_hday_data_creation(self):
        """Test TeamMemberHdayData model creation."""
        events = [
            HdayEvent(
                type="range",
                start="2025/01/15",
                end="2025/01/15",
                flags=[],
                title="Vacation",
                raw="2025/01/15 # Vacation",
            )
        ]
        data = TeamMemberHdayData(
            username="jdoe",
            display_name="John Doe",
            raw="2025/01/15 # Vacation\n",
            events=events,
            etag="sha256:abc123",
        )

        assert data.username == "jdoe"
        assert data.display_name == "John Doe"
        assert data.raw == "2025/01/15 # Vacation\n"
        assert len(data.events) == 1
        assert data.etag == "sha256:abc123"

    def test_team_member_hday_data_empty(self):
        """Test TeamMemberHdayData with empty data (file not found case)."""
        data = TeamMemberHdayData(
            username="jdoe",
            display_name="John Doe",
            raw="",
            events=[],
            etag=None,
        )

        assert data.username == "jdoe"
        assert data.raw == ""
        assert data.events == []
        assert data.etag is None

    def test_team_hday_response_creation(self):
        """Test TeamHdayResponse model creation."""
        members_data = [
            TeamMemberHdayData(
                username="jdoe",
                display_name="John Doe",
                raw="2025/01/15 # Vacation\n",
                events=[],
                etag="sha256:abc123",
            ),
            TeamMemberHdayData(
                username="asmith",
                display_name="Alice Smith",
                raw="",
                events=[],
                etag=None,
            ),
        ]
        response = TeamHdayResponse(team_id="team1", members=members_data)

        assert response.team_id == "team1"
        assert len(response.members) == 2
        assert response.members[0].username == "jdoe"
        assert response.members[1].etag is None


class TestGetTeamPath:
    """Tests for get_team_path function."""

    def test_get_team_path_basic(self, share_dir):
        """Test basic team path construction."""
        # Create a team directory
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        path = get_team_path("team1")

        assert isinstance(path, Path)
        assert path.name == "team1"
        assert path.exists()
        assert path.is_dir()

    def test_get_team_path_not_found(self, share_dir):
        """Test that non-existent team raises error."""
        with pytest.raises(TeamNotFoundError, match="Team not found"):
            get_team_path("nonexistent")

    def test_get_team_path_rejects_path_traversal(self, share_dir):
        """Test that path traversal attempts are rejected."""
        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path("../etc")

        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path("../../passwd")

        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path("team/../admin")

    def test_get_team_path_rejects_special_characters(self, share_dir):
        """Test that special characters are rejected."""
        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path("team/subdir")

        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path("team\\subdir")

    def test_get_team_path_allows_valid_characters(self, share_dir):
        """Test that valid characters are allowed in team_id."""
        # Create team directories with valid names
        valid_names = ["team-1", "team.alpha", "team_beta", "Team123"]
        for name in valid_names:
            team_dir = share_dir / name
            team_dir.mkdir()

            path = get_team_path(name)
            assert path.name == name

    def test_get_team_path_rejects_leading_dot(self, share_dir):
        """Test that team_id with leading dot is rejected."""
        with pytest.raises(ValueError, match="Invalid team_id"):
            get_team_path(".hidden")


class TestReadTeamConfig:
    """Tests for read_team_config function."""

    def test_read_team_config_basic(self, share_dir):
        """Test reading a basic team config."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        config_file = team_dir / "config"
        config_file.write_text("Engineering Team", encoding="utf-8")

        name = read_team_config("team1")

        assert name == "Engineering Team"

    def test_read_team_config_strips_whitespace(self, share_dir):
        """Test that whitespace is stripped from team name."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        config_file = team_dir / "config"
        config_file.write_text("  Engineering Team  \n", encoding="utf-8")

        name = read_team_config("team1")

        assert name == "Engineering Team"

    def test_read_team_config_file_not_found(self, share_dir):
        """Test that missing config file raises error."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        with pytest.raises(TeamNotFoundError, match="Team configuration not found"):
            read_team_config("team1")

    def test_read_team_config_team_not_found(self, share_dir):
        """Test that missing team directory raises error."""
        with pytest.raises(TeamNotFoundError, match="Team not found"):
            read_team_config("nonexistent")


class TestReadTeamMembers:
    """Tests for read_team_members function."""

    def test_read_team_members_basic(self, share_dir):
        """Test reading a basic team members file."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\nasmith,Alice Smith\n", encoding="utf-8"
        )

        members = read_team_members("team1")

        assert len(members) == 2
        assert members[0].username == "jdoe"
        assert members[0].display_name == "John Doe"
        assert members[1].username == "asmith"
        assert members[1].display_name == "Alice Smith"

    def test_read_team_members_strips_whitespace(self, share_dir):
        """Test that whitespace is stripped from usernames and display names."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        people_file = team_dir / "people"
        people_file.write_text(
            "  jdoe  ,  John Doe  \n  asmith  ,  Alice Smith  \n",
            encoding="utf-8",
        )

        members = read_team_members("team1")

        assert len(members) == 2
        assert members[0].username == "jdoe"
        assert members[0].display_name == "John Doe"

    def test_read_team_members_skips_empty_lines(self, share_dir):
        """Test that empty lines are skipped."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        people_file = team_dir / "people"
        people_file.write_text(
            "jdoe,John Doe\n\n\nasmith,Alice Smith\n\n", encoding="utf-8"
        )

        members = read_team_members("team1")

        assert len(members) == 2

    def test_read_team_members_handles_comma_in_display_name(self, share_dir):
        """Test that commas in display names are handled correctly."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()
        people_file = team_dir / "people"
        people_file.write_text("jdoe,Doe, John\n", encoding="utf-8")

        members = read_team_members("team1")

        assert len(members) == 1
        assert members[0].username == "jdoe"
        assert members[0].display_name == "Doe, John"

    def test_read_team_members_file_not_found(self, share_dir):
        """Test that missing people file raises error."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        with pytest.raises(TeamNotFoundError, match="Team members file not found"):
            read_team_members("team1")

    def test_read_team_members_team_not_found(self, share_dir):
        """Test that missing team directory raises error."""
        with pytest.raises(TeamNotFoundError, match="Team not found"):
            read_team_members("nonexistent")


class TestReadTeamHdayFiles:
    """Tests for read_team_hday_files function."""
    
    def setup_method(self):
        """Clear cache before each test."""
        from app.cache.store import get_cache
        cache = get_cache()
        cache._hday_entries.clear()
        cache._team_entries.clear()

    def test_read_team_hday_files_all_exist(self, share_dir):
        """Test reading .hday files when all files exist."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create members
        members = [
            TeamMember(username="jdoe", display_name="John Doe"),
            TeamMember(username="asmith", display_name="Alice Smith"),
        ]

        # Create .hday files
        (team_dir / "jdoe.hday").write_text(
            "2025/01/15 # Vacation\n", encoding="utf-8"
        )
        (team_dir / "asmith.hday").write_text(
            "2025/02/20 # Conference\n", encoding="utf-8"
        )

        member_data = read_team_hday_files("team1", members)

        assert len(member_data) == 2
        assert member_data[0].username == "jdoe"
        assert member_data[0].raw == "2025/01/15 # Vacation\n"
        assert len(member_data[0].events) == 1
        assert member_data[0].etag is not None
        assert member_data[1].username == "asmith"
        assert member_data[1].raw == "2025/02/20 # Conference\n"
        assert len(member_data[1].events) == 1

    def test_read_team_hday_files_some_missing(self, share_dir):
        """Test reading .hday files when some files are missing."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create members
        members = [
            TeamMember(username="jdoe", display_name="John Doe"),
            TeamMember(username="asmith", display_name="Alice Smith"),
        ]

        # Create only one .hday file
        (team_dir / "jdoe.hday").write_text(
            "2025/01/15 # Vacation\n", encoding="utf-8"
        )

        member_data = read_team_hday_files("team1", members)

        assert len(member_data) == 2
        # First member has data
        assert member_data[0].username == "jdoe"
        assert member_data[0].raw == "2025/01/15 # Vacation\n"
        assert member_data[0].etag is not None
        # Second member has empty data
        assert member_data[1].username == "asmith"
        assert member_data[1].raw == ""
        assert member_data[1].events == []
        assert member_data[1].etag is None

    def test_read_team_hday_files_all_missing(self, share_dir):
        """Test reading .hday files when all files are missing."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create members
        members = [
            TeamMember(username="jdoe", display_name="John Doe"),
            TeamMember(username="asmith", display_name="Alice Smith"),
        ]

        member_data = read_team_hday_files("team1", members)

        assert len(member_data) == 2
        # Both members have empty data
        for data in member_data:
            assert data.raw == ""
            assert data.events == []
            assert data.etag is None

    def test_read_team_hday_files_empty_file(self, share_dir):
        """Test reading an empty .hday file."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create member
        members = [TeamMember(username="jdoe", display_name="John Doe")]

        # Create empty .hday file
        (team_dir / "jdoe.hday").write_text("", encoding="utf-8")

        member_data = read_team_hday_files("team1", members)

        assert len(member_data) == 1
        assert member_data[0].username == "jdoe"
        assert member_data[0].raw == ""
        assert member_data[0].events == []
        assert member_data[0].etag is not None  # Empty file still has etag

    def test_read_team_hday_files_with_comments(self, share_dir):
        """Test reading .hday files with various event types."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create member
        members = [TeamMember(username="jdoe", display_name="John Doe")]

        # Create .hday file with multiple events
        hday_content = """2025/01/15 # Vacation
2025/02/20-2025/02/22 # Conference
d1 # Every Monday
"""
        (team_dir / "jdoe.hday").write_text(hday_content, encoding="utf-8")

        member_data = read_team_hday_files("team1", members)

        assert len(member_data) == 1
        assert member_data[0].username == "jdoe"
        assert len(member_data[0].events) == 3
        assert member_data[0].events[0].type == "range"
        assert member_data[0].events[1].type == "range"
        assert member_data[0].events[2].type == "weekly"

    def test_read_team_hday_files_team_not_found(self, share_dir):
        """Test that missing team directory raises error."""
        members = [TeamMember(username="jdoe", display_name="John Doe")]

        with pytest.raises(TeamNotFoundError, match="Team not found"):
            read_team_hday_files("nonexistent", members)

    def test_read_team_hday_files_rejects_path_traversal_username(self, share_dir):
        """Test that path traversal in username is rejected."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create members with malicious usernames
        members = [
            TeamMember(username="../etc/passwd", display_name="Hacker"),
            TeamMember(username="../../secrets", display_name="Hacker2"),
        ]

        member_data = read_team_hday_files("team1", members)

        # Should return empty data for invalid usernames
        assert len(member_data) == 2
        for data in member_data:
            assert data.raw == ""
            assert data.events == []
            assert data.etag is None

    def test_read_team_hday_files_rejects_special_chars_in_username(self, share_dir):
        """Test that special characters in username are rejected."""
        team_dir = share_dir / "team1"
        team_dir.mkdir()

        # Create members with invalid usernames
        members = [
            TeamMember(username="user/file", display_name="Invalid User"),
            TeamMember(username="user\\file", display_name="Invalid User 2"),
        ]

        member_data = read_team_hday_files("team1", members)

        # Should return empty data for invalid usernames
        assert len(member_data) == 2
        for data in member_data:
            assert data.raw == ""
            assert data.events == []
            assert data.etag is None
