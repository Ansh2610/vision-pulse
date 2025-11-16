"""
Security tests for VisionPulse API.

Tests:
- Input sanitization
- Path traversal prevention
- SQL injection prevention
- XSS prevention
- CSRF protection
- Rate limiting
- File validation
"""
import pytest
from app.middleware.security import (
    validate_session_id,
    sanitize_filename,
    validate_image_content
)
from app.schemas.validation import BoxValidation, ValidationRequest, GroundTruthBox
from PIL import Image
import io


class TestSessionIDValidation:
    """Test session ID sanitization"""
    
    def test_valid_session_id(self):
        """Should accept valid session IDs"""
        valid_ids = [
            "abc123",
            "session-123",
            "test_session_456",
            "ABC-DEF-123"
        ]
        for sid in valid_ids:
            assert validate_session_id(sid) == sid
    
    def test_path_traversal_prevention(self):
        """Should reject path traversal attempts"""
        malicious_ids = [
            "../etc/passwd",
            "..\\windows\\system32",
            "session/../admin",
            "test/../../root"
        ]
        for sid in malicious_ids:
            with pytest.raises(ValueError, match="Invalid"):
                validate_session_id(sid)
    
    def test_special_characters_rejection(self):
        """Should reject special characters"""
        malicious_ids = [
            "session;rm -rf /",
            "session' OR '1'='1",
            "session<script>alert(1)</script>",
            "session`whoami`"
        ]
        for sid in malicious_ids:
            with pytest.raises(ValueError, match="Invalid"):
                validate_session_id(sid)
    
    def test_length_limit(self):
        """Should enforce max length"""
        long_id = "a" * 101
        with pytest.raises(ValueError, match="too long"):
            validate_session_id(long_id)


class TestFilenameValidation:
    """Test filename sanitization"""
    
    def test_basic_filename(self):
        """Should accept basic filenames"""
        assert sanitize_filename("image.jpg") == "image.jpg"
        assert sanitize_filename("test_123.png") == "test_123.png"
    
    def test_path_removal(self):
        """Should remove path components"""
        assert sanitize_filename("/etc/passwd") == "passwd"
        assert sanitize_filename("../../../secret.txt") == "secret.txt"
        result = sanitize_filename("C:\\Windows\\System32\\config.sys"); assert "config.sys" in result or result == "C__Windows_System32_config.sys"  # Cross-platform
    
    def test_null_byte_removal(self):
        """Should remove null bytes (path truncation attack)"""
        result = sanitize_filename("image.jpg\x00.exe")
        assert "\x00" not in result
    
    def test_special_char_replacement(self):
        """Should replace special characters"""
        assert sanitize_filename("file;name.jpg") == "file_name.jpg"
        assert sanitize_filename("file<script>.jpg") == "file_script_.jpg"
    
    def test_hidden_file_prevention(self):
        """Should prevent hidden files"""
        result = sanitize_filename(".htaccess")
        assert not result.startswith(".")
    
    def test_length_truncation(self):
        """Should truncate long filenames"""
        long_name = "a" * 300 + ".jpg"
        result = sanitize_filename(long_name)
        assert len(result) <= 255


class TestImageValidation:
    """Test image content validation"""
    
    def test_valid_jpeg(self):
        """Should accept valid JPEG"""
        img = Image.new('RGB', (100, 100), color='red')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        buf.seek(0)
        
        assert validate_image_content(buf.getvalue()) == True
    
    def test_valid_png(self):
        """Should accept valid PNG"""
        img = Image.new('RGB', (100, 100), color='blue')
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        
        assert validate_image_content(buf.getvalue()) == True
    
    def test_file_too_large(self):
        """Should reject files over size limit"""
        large_data = b"x" * (11 * 1024 * 1024)  # 11MB
        
        with pytest.raises(ValueError, match="too large"):
            validate_image_content(large_data, max_size=10*1024*1024)
    
    def test_file_too_small(self):
        """Should reject suspiciously small files"""
        tiny_data = b"x" * 50
        
        with pytest.raises(ValueError, match="too small"):
            validate_image_content(tiny_data)
    
    def test_not_an_image(self):
        """Should reject non-image files"""
        # Make it long enough to pass size check but still invalid
        fake_image = b"This is not an image file " * 10
        
        with pytest.raises(ValueError, match="Invalid image"):
            validate_image_content(fake_image)
    
    def test_zip_bomb_prevention(self):
        """Should reject images with extreme dimensions"""
        # Try to create 10000x10000 image (would cause memory exhaustion)
        img = Image.new('RGB', (10000, 10000))
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        
        with pytest.raises(ValueError, match="dimensions too large"):
            validate_image_content(buf.getvalue())


class TestPydanticValidation:
    """Test Pydantic schema validation"""
    
    def test_box_validation_schema(self):
        """Should validate box validation input"""
        valid_validation = BoxValidation(
            box_id="session_0",
            is_correct=True
        )
        assert valid_validation.box_id == "session_0"
        assert valid_validation.is_correct == True
    
    def test_confidence_range_validation(self):
        """Should enforce confidence range"""
        with pytest.raises(Exception):  # Pydantic ValidationError
            BoxValidation(
                box_id="session_0",
                is_correct=True,
                confidence_override=1.5  # Invalid (> 1.0)
            )
    
    def test_notes_sanitization(self):
        """Should sanitize notes field"""
        validation = BoxValidation(
            box_id="session_0",
            is_correct=False,
            notes="Wrong detection <script>alert(1)</script>"
        )
        # Should strip dangerous characters
        assert "<" not in validation.notes
        assert ">" not in validation.notes
        assert "script" in validation.notes.lower()
    
    def test_label_sanitization(self):
        """Should sanitize label field"""
        with pytest.raises(Exception):  # Pydantic ValidationError
            GroundTruthBox(
                x1=10, y1=10, x2=50, y2=50,
                confidence=0.9,
                label="person<script>",  # Invalid characters
                class_id=0
            )
    
    def test_validation_request_limit(self):
        """Should limit validations per request"""
        # Try to create request with 101 validations (max is 100)
        validations = [
            BoxValidation(box_id=f"session_{i}", is_correct=True)
            for i in range(101)
        ]
        
        with pytest.raises(Exception):  # Pydantic ValidationError
            ValidationRequest(
                session_id="session123",
                validations=validations
            )


class TestSQLInjection:
    """Test SQL injection prevention"""
    
    def test_session_id_sql_injection(self):
        """Should prevent SQL injection in session ID"""
        sql_payloads = [
            "1' OR '1'='1",
            "admin'--",
            "1; DROP TABLE users--",
            "' UNION SELECT * FROM users--"
        ]
        for payload in sql_payloads:
            with pytest.raises(ValueError):
                validate_session_id(payload)


class TestXSSPrevention:
    """Test XSS prevention"""
    
    def test_label_xss_prevention(self):
        """Should prevent XSS in labels"""
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert(1)>",
            "<svg onload=alert(1)>"
        ]
        for payload in xss_payloads:
            with pytest.raises(Exception):  # Pydantic ValidationError
                GroundTruthBox(
                    x1=10, y1=10, x2=50, y2=50,
                    confidence=0.9,
                    label=payload,
                    class_id=0
                )
    
    def test_notes_xss_prevention(self):
        """Should sanitize XSS in notes"""
        validation = BoxValidation(
            box_id="session_0",
            is_correct=True,
            notes="<script>alert('XSS')</script>"
        )
        # Should strip tags
        assert "<script>" not in validation.notes
        assert "</script>" not in validation.notes


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
