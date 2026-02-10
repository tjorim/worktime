"""Tests for .hday service layer."""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.hday_service import (
    HdayConflictError,
    HdayFileNotFoundError,
    ShareNotAccessibleError,
    compute_etag,
    get_hday_path,
    read_hday_file,
    write_hday_file,
)


class TestComputeEtag:
    """Tests for compute_etag function."""

    def test_compute_etag_basic(self):
        """Test basic etag computation."""
        content = "2025/01/15 # Vacation"
        etag = compute_etag(content)

        assert etag.startswith("sha256:")
        assert len(etag) == 71  # "sha256:" (7) + 64 hex chars

    def test_compute_etag_empty(self):
        """Test etag computation for empty content."""
        etag = compute_etag("")
        assert etag.startswith("sha256:")

    def test_compute_etag_deterministic(self):
        """Test that etag is deterministic."""
        content = "2025/01/15 # Vacation"
        etag1 = compute_etag(content)
        etag2 = compute_etag(content)

        assert etag1 == etag2

    def test_compute_etag_different_content(self):
        """Test that different content produces different etags."""
        etag1 = compute_etag("content1")
        etag2 = compute_etag("content2")

        assert etag1 != etag2

    def test_compute_etag_unicode(self):
        """Test etag computation with Unicode content."""
        content = "2025/01/15 # 휴가일 (vacation in Korean)"
        etag = compute_etag(content)

        assert etag.startswith("sha256:")


class TestGetHdayPath:
    """Tests for get_hday_path function."""

    def test_get_hday_path_basic(self):
        """Test basic path construction."""
        path = get_hday_path("testuser")

        assert isinstance(path, Path)
        assert path.name == "testuser.hday"

    def test_get_hday_path_different_users(self):
        """Test path construction for different users."""
        path1 = get_hday_path("user1")
        path2 = get_hday_path("user2")

        assert path1 != path2
        assert path1.name == "user1.hday"
        assert path2.name == "user2.hday"


class TestReadHdayFile:
    """Tests for read_hday_file function."""

    def test_read_existing_file(self, tmp_path):
        """Test reading an existing .hday file."""
        # Create a test file
        test_file = tmp_path / "testuser.hday"
        content = "2025/01/15 # Vacation"
        test_file.write_text(content, encoding="utf-8")

        # Patch to use temp directory
        with patch("app.services.hday_service.get_hday_path", return_value=test_file):
            with patch("app.services.hday_service.os.access", return_value=True):
                with patch("app.services.hday_service.Path.exists", return_value=True):
                    # Read the file
                    raw, etag = read_hday_file("testuser")

                    assert raw == content
                    assert etag.startswith("sha256:")
                    assert etag == compute_etag(content)

    def test_read_nonexistent_file(self, tmp_path):
        """Test reading a nonexistent file."""
        test_file = tmp_path / "nonexistent.hday"

        with patch("app.services.hday_service.get_hday_path", return_value=test_file):
            with patch("app.services.hday_service.os.access", return_value=True):
                with patch.object(Path, "exists", return_value=True):
                    # Mock file existence check to return False for file itself
                    test_file_mock = Path(test_file)
                    with patch.object(test_file_mock, "exists", return_value=False):
                        with pytest.raises(HdayFileNotFoundError) as exc_info:
                            read_hday_file("nonexistent")

                        assert "nonexistent" in str(exc_info.value)

    def test_read_file_with_unicode(self, tmp_path):
        """Test reading a file with Unicode content."""
        test_file = tmp_path / "testuser.hday"
        content = "2025/01/15 # 휴가일"
        test_file.write_text(content, encoding="utf-8")

        with patch("app.services.hday_service.get_hday_path", return_value=test_file):
            with patch("app.services.hday_service.os.access", return_value=True):
                with patch("app.services.hday_service.Path.exists", return_value=True):
                    raw, etag = read_hday_file("testuser")

                    assert raw == content
                    assert etag == compute_etag(content)

    def test_read_empty_file(self, tmp_path):
        """Test reading an empty file."""
        test_file = tmp_path / "testuser.hday"
        test_file.write_text("", encoding="utf-8")

        with patch("app.services.hday_service.get_hday_path", return_value=test_file):
            with patch("app.services.hday_service.os.access", return_value=True):
                with patch("app.services.hday_service.Path.exists", return_value=True):
                    raw, etag = read_hday_file("testuser")

                    assert raw == ""
                    assert etag == compute_etag("")

    def test_read_share_dir_not_exists(self):
        """Test reading when share directory doesn't exist."""
        nonexistent_path = Path("/nonexistent/directory")
        test_file = nonexistent_path / "testuser.hday"

        with patch("app.services.hday_service.get_hday_path", return_value=test_file):
            with patch.object(Path, "exists", return_value=False):
                with pytest.raises(ShareNotAccessibleError) as exc_info:
                    read_hday_file("testuser")

                assert "not found" in str(exc_info.value).lower()




class TestWriteHdayFile:
    """Tests for write_hday_file function."""

    def test_write_new_file(self, tmp_path):
        """Test writing a new file with etag=None."""
        content = "2025/01/15 # Vacation"
        file_path = tmp_path / "testuser.hday"

        with patch("app.services.hday_service.get_hday_path", return_value=file_path):
            with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
                etag = write_hday_file("testuser", content, expected_etag=None)

        # Verify file was created
        assert file_path.exists()
        assert file_path.read_text(encoding="utf-8") == content

        # Verify etag
        assert etag == compute_etag(content)

    def test_write_new_file_when_exists(self, tmp_path):
        """Test that writing a new file fails if it already exists."""
        # Create existing file
        file_path = tmp_path / "testuser.hday"
        existing_content = "existing content"
        file_path.write_text(existing_content, encoding="utf-8")

        # Try to write new file
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            with pytest.raises(HdayConflictError) as exc_info:
                write_hday_file("testuser", "new content", expected_etag=None)

        # Verify existing file is unchanged
        assert file_path.read_text(encoding="utf-8") == existing_content

        # Verify current etag is provided in exception
        assert exc_info.value.current_etag == compute_etag(existing_content)

    def test_update_existing_file(self, tmp_path):
        """Test updating an existing file with correct etag."""
        # Create existing file
        file_path = tmp_path / "testuser.hday"
        original_content = "2025/01/15 # Original"
        file_path.write_text(original_content, encoding="utf-8")
        original_etag = compute_etag(original_content)

        # Update file
        new_content = "2025/01/15 # Updated"
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            new_etag = write_hday_file("testuser", new_content, expected_etag=original_etag)

        # Verify file was updated
        assert file_path.read_text(encoding="utf-8") == new_content
        assert new_etag == compute_etag(new_content)
        assert new_etag != original_etag

    def test_update_nonexistent_file(self, tmp_path):
        """Test that updating a nonexistent file fails."""
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            with pytest.raises(HdayConflictError) as exc_info:
                write_hday_file(
                    "nonexistent", "content", expected_etag="sha256:someetag"
                )

            assert "does not exist" in str(exc_info.value).lower()

    def test_update_with_wrong_etag(self, tmp_path):
        """Test that updating with wrong etag fails."""
        # Create existing file
        file_path = tmp_path / "testuser.hday"
        original_content = "2025/01/15 # Original"
        file_path.write_text(original_content, encoding="utf-8")
        current_etag = compute_etag(original_content)

        # Try to update with wrong etag
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            with pytest.raises(HdayConflictError) as exc_info:
                write_hday_file(
                    "testuser", "new content", expected_etag="sha256:wrongetag"
                )

        # Verify file is unchanged
        assert file_path.read_text(encoding="utf-8") == original_content

        # Verify current etag is provided in exception
        assert exc_info.value.current_etag == current_etag

    def test_atomic_write_cleanup_on_error(self, tmp_path):
        """Test that temporary file is cleaned up on write error."""
        # Create a function that will fail during os.replace
        def failing_replace(*args, **kwargs):
            raise OSError("Simulated write failure")

        # Patch os.replace to simulate failure
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            with patch("os.replace", side_effect=failing_replace):
                # Attempt to write file
                with pytest.raises(OSError):
                    write_hday_file("testuser", "content", expected_etag=None)

        # Verify no .tmp file is left behind
        temp_file = tmp_path / "testuser.hday.tmp"
        assert not temp_file.exists()

    def test_write_unicode_content(self, tmp_path):
        """Test writing Unicode content."""
        content = "2025/01/15 # 휴가일"

        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            etag = write_hday_file("testuser", content, expected_etag=None)

        file_path = tmp_path / "testuser.hday"
        assert file_path.read_text(encoding="utf-8") == content
        assert etag == compute_etag(content)

    def test_write_empty_content(self, tmp_path):
        """Test writing empty content."""
        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            etag = write_hday_file("testuser", "", expected_etag=None)

        file_path = tmp_path / "testuser.hday"
        assert file_path.read_text(encoding="utf-8") == ""
        assert etag == compute_etag("")

    def test_write_share_dir_not_exists(self):
        """Test writing when share directory doesn't exist."""
        nonexistent_path = Path("/nonexistent/directory")

        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=nonexistent_path):
            with pytest.raises(ShareNotAccessibleError) as exc_info:
                write_hday_file("testuser", "content", expected_etag=None)

            assert "not found" in str(exc_info.value).lower()

    def test_multiple_sequential_updates(self, tmp_path):
        """Test multiple sequential updates with etag tracking."""
        # Create initial file
        content1 = "2025/01/15 # Version 1"

        with patch("app.services.hday_service.settings.get_share_dir_path", return_value=tmp_path):
            etag1 = write_hday_file("testuser", content1, expected_etag=None)

            # Update to version 2
            content2 = "2025/01/15 # Version 2"
            etag2 = write_hday_file("testuser", content2, expected_etag=etag1)

            # Update to version 3
            content3 = "2025/01/15 # Version 3"
            etag3 = write_hday_file("testuser", content3, expected_etag=etag2)

        # Verify final state
        file_path = tmp_path / "testuser.hday"
        assert file_path.read_text(encoding="utf-8") == content3
        assert etag3 == compute_etag(content3)

        # Verify etags are different
        assert etag1 != etag2 != etag3
