# Copilot Instructions for Metadata Remote

**Metadata Remote** is a web-based audio metadata editor for headless servers. It provides a browser-accessible interface for editing audio file metadata (MP3, FLAC, OGG, OPUS, M4A, M4B, WMA, WAV, WavPack) on servers without desktop environments.

## Architecture Overview

### Full-Stack Design

- **Backend**: Flask application (`app.py`) with REST API endpoints serving the metadata editing operations
- **Frontend**: Vanilla JavaScript with modular architecture (12 specialized modules coordinated by `app.js`)
- **Core Engine**: Python modules in `core/` handling metadata I/O, intelligent inference, and history management
- **Containerized**: Docker multi-architecture support (x86_64, ARM64, ARMv7)

### Key Components

#### Python Backend (`core/` directory)

1. **`metadata/`** - Mutagen-based metadata operations
   - `reader.py`: Extract metadata from audio files using Mutagen library
   - `writer.py`: Apply metadata changes with format-specific handling (some formats don't support embedded art)
   - `normalizer.py`: Normalize tags across different audio formats
   - `mutagen_handler.py`: Abstraction layer for Mutagen operations

2. **`inference.py`** - Multi-phase metadata suggestion engine
   - Phase 1: Local inference from filename patterns, folder structure, sibling files
   - Phase 2: MusicBrainz API queries with rate-limiting (1 request/sec)
   - Phase 3: Synthesis combining local + online evidence
   - Phase 4: Confidence scoring with field-specific thresholds
   - Returns top 5 suggestions per field with confidence percentages

3. **`history.py`** - Undo/redo system tracking up to 1000 operations
   - Stores `ActionType` enum (METADATA_CHANGE, BATCH_METADATA, ALBUM_ART_CHANGE, DELETE_FIELD, CREATE_FIELD, etc.)
   - Maps file paths to old/new values for reversibility
   - Batch operations tracked as single history items with multiple affected files

4. **`album_art/`** - Image handling and corruption detection
   - `extractor.py`: Decode embedded artwork from files
   - `processor.py`: Detect corrupted album art; fix by re-encoding
   - `manager.py`: Handle album art changes and batch operations

5. **`batch/processor.py`** - Bulk operations on folder contents
   - `process_folder_files()`: Generic function accepting a processing function to apply to all audio files in a folder

#### Frontend JavaScript Modules (`static/js/`)

1. **`state.js`** - Centralized state management (no external store library)
   - Single source of truth for UI state, metadata, file listings
   - Used by all modules via `window.MetadataRemote.State`

2. **`api.js`** - HTTP client layer
   - `call()` method handles all fetch requests with centralized error handling
   - Endpoints: `/tree/`, `/files/`, `/metadata/*`, `/infer/`, `/apply-metadata/`, `/rename`, `/history/`

3. **`app.js`** - Main coordinator
   - Initializes all modules with dependency injection via callbacks
   - Binds global functions for HTML onclick handlers (e.g., `saveFilename()`, `applyArtToFolder()`)
   - Routes cross-module communication (e.g., file selection → metadata loading → inference)

4. **`navigation/`** - Tree navigation and keyboard shortcuts
   - `tree.js`: Lazy-load directory tree with expand/collapse
   - `keyboard.js`: Global keyboard event handler
   - `state-machine.js`: Track focus context (header, tree, file list, form)
   - `router.js`: Client-side routing logic
   - `focus-manager.js`: Manage keyboard focus for a11y

5. **`metadata/`** - Metadata UI operations
   - `editor.js`: Field editing, long-form content (>100 chars gets dedicated modal)
   - `album-art.js`: Preview, upload, delete album art
   - `inference.js`: Display suggestions with confidence scores
   - `field-edit-modal.js`: Long-form editor for extended text fields

6. **`files/manager.js`** - File list operations
   - Rename files in-browser
   - Direct editing without download/re-upload workflow

7. **`ui/`** - UI utilities
   - `button-status.js`: Visual feedback for operations (loading, success, error states)
   - `utilities.js`: DOM helpers, ID/class management
   - `pane-resize.js`: Resizable workspace panels
   - `theme-toggle.js`: Light/dark mode switching

## Critical Developer Workflows

### Running the Application

```bash
# Local development (requires Python 3.7+, Flask, Mutagen)
python app.py

# Docker (recommended)
docker compose up -d

# Edit config via environment variables:
# MUSIC_DIR, PUID, PGID, SHOW_HIDDEN_FILES
# PORT defaults to 8338, HOST to 0.0.0.0
```

### Testing Format Support

- Supported: `.mp3`, `.flac`, `.wav`, `.m4a`, `.m4b`, `.wma`, `.wv`, `.ogg`, `.opus`
- Test with multiple formats - some have unique constraints:
  - M4A/M4B use iTunes-style metadata
  - WMA uses Windows Media format
  - FLAC/OGG use Vorbis Comments
- Album art support varies: some formats don't support embedded art (checked in `writer.py`)

### Common API Endpoints Pattern

All endpoints use URL-encoded file paths. Example: `/metadata/path/to/file.mp3`

- GET endpoints return data
- POST endpoints apply changes and update history
- All responses include format info and limitations

## Project-Specific Conventions

### Metadata Field Handling

- **Standard Fields**: artist, album, title, track, etc. (common to all formats)
- **Extended Fields**: arbitrary user-defined fields, cleared/recreated per format
- **Field Normalization**: Different audio formats use different tag names—normalizer maps them to common schema
- **Format Limitations**: Some formats (e.g., certain legacy formats) have field restrictions checked before writing

### Batch Operations

- Single-click bulk changes apply to ALL files in a folder (not recursive)
- Batch operations create one history entry with all affected files mapped
- UI shows confirmation dialog with file count before proceeding

### History System

- Stores both old and new values for every file affected by an action
- Supports bulk action reversal (undo one batch operation reverts all files at once)
- Limited to 1000 operations max; older entries automatically pruned
- Format: `ActionType` enum + files list + old_values/new_values maps

### Inference Engine Patterns

- **Confidence Thresholds**: Field-specific (`FIELD_THRESHOLDS` in config)
- **Evidence State**: Built from filename, folder context, existing metadata, sibling patterns
- **Rate Limiting**: MusicBrainz queries respect 1 request/sec limit
- **Caching**: Inference results cached for `INFERENCE_CACHE_DURATION`
- **MusicBrainz User-Agent**: Required; set in config (bot identity string)

### Error Handling

- Backend: File path validation via `validate_path()` prevents directory traversal
- Ownership fix: `fix_file_ownership()` applies PUID/PGID to written files (Docker compatibility)
- Corrupted art: Auto-detected and repaired before operations
- API errors: Consistent JSON format `{'error': 'message'}` with HTTP status codes

## Integration Points & External Dependencies

### Audio Format Handling

- **Mutagen Library**: Abstract handler in `core/metadata/mutagen_handler.py` manages format-specific operations
- **Format Config**: `FORMAT_METADATA_CONFIG` defines per-format field mappings and constraints
- **Image Processing**: Pillow library for album art validation and corruption detection

### MusicBrainz Integration

- Called only for fields where local inference confidence is below threshold
- Implements exponential backoff if rate-limited (429 responses)
- User-agent required; modify `MUSICBRAINZ_USER_AGENT` in config.py

### File Ownership (Docker-specific)

- After writing metadata, ownership corrected to `PUID:PGID` for container environments
- Prevents permission issues when editing files mounted from host
- Uses `os.chown()` internally

### Keyboard Navigation Architecture

- Global keyboard handler in `navigation/keyboard.js` dispatches to context-aware modules
- State machine tracks focus context to route keypresses correctly
- No external keyboard library; uses native DOM events

## Common Modification Patterns

### Adding a New Metadata Field

1. Add to `FORMAT_METADATA_CONFIG` in `config.py` with format-specific mappings
2. Update inference thresholds in `FIELD_THRESHOLDS` if needed
3. Frontend auto-discovers fields from backend schema; no UI changes required

### Supporting a New Audio Format

1. Verify Mutagen supports it
2. Add extension to `AUDIO_EXTENSIONS` in config.py
3. Define format mapping in `FORMAT_METADATA_CONFIG`
4. Add MIME type to `MIME_TYPES`
5. Test metadata read/write with that format
6. Update format limitations if applicable (e.g., no embedded art)

### Adding a Bulk Operation

1. Create a processing function in `core/batch/processor.py`
2. Add Flask route in `app.py` that calls `process_folder_files()`
3. Create history entry with batch operation type
4. Frontend automatically works with button handlers in `app.js` global functions

## State Management Patterns

### No External Store Library

The codebase uses plain JavaScript object (`window.MetadataRemote.State`) as the single source of truth:

- All modules read/write to `State` directly
- No Vuex, Redux, or similar—intentionally lightweight
- Modules communicate by reading updated State or via dependency-injected callbacks

### Dependency Injection in Modules

- `app.js` initializes modules with callbacks (e.g., `TreeNav.init(selectTreeItem, loadFiles)`)
- Avoids global function chaos; modules invoke callbacks for cross-module communication
- Example: file selection triggers `selectFileItem()` callback → loads metadata → triggers inference

## Reference Examples

**Inferring metadata for a field:**

```python
suggestions = inference_engine.infer_field(file_path, field, existing_metadata, folder_context)
# Returns list of dicts: {'value': '...', 'confidence': 85.5, 'source': 'MusicBrainz'}
```

**Applying metadata to a file:**

```python
apply_metadata_to_file(filepath, {'artist': 'New Artist'}, art_data=base64_encoded_art)
# Handles format-specific writing, corruption repair, ownership correction
```

**Batch operation example:**

```python
results = process_folder_files(folder_path, apply_metadata_to_file, "Apply Metadata")
# Processes all audio files in folder, returns summary with success/error counts
```

**Frontend API call:**

```javascript
const metadata = await API.call(`/metadata/${encodeURIComponent(filepath)}`);
// Centralized error handling; throws on non-200 responses
```
