/*
 * Metadata Remote - Intelligent audio metadata editor
 * Copyright (C) 2025 Dr. William Nelson Leonard
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Folder Fields Module for Metadata Remote
 * Discovers and suggests common fields from other files in the same folder
 */

(function () {
  // Create namespace if it doesn't exist
  window.MetadataRemote = window.MetadataRemote || {};
  window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};

  // Create shortcuts
  const State = window.MetadataRemote.State;
  const API = window.MetadataRemote.API;

  // Store for folder field data
  let folderFieldsCache = new Map();
  let currentFolderPath = null;

  // Common metadata fields that users frequently want to add
  const commonFields = [
    { id: "title", name: "Title" },
    { id: "artist", name: "Artist" },
    { id: "album", name: "Album" },
    { id: "albumartist", name: "Album Artist" },
    { id: "genre", name: "Genre" },
    { id: "date", name: "Year" },
    { id: "track", name: "Track #" },
    { id: "disc", name: "Disc #" },
    { id: "composer", name: "Composer" },
    { id: "comment", name: "Comment" },
    { id: "lyrics", name: "Lyrics" },
    { id: "bpm", name: "BPM" },
  ];

  // Common filename delimiters
  const FILENAME_DELIMITERS = /\s*[-_|｜]\s*/;

  // Track number patterns
  const TRACK_NUMBER_PATTERN = /^(\d{1,3})\.?\s*/;

  window.MetadataRemote.Metadata.FolderFields = {
    /**
     * Initialize the folder fields module
     */
    init() {
      // Set up event listeners for the toggle
      const toggle = document.querySelector(".folder-fields-toggle");
      if (toggle) {
        toggle.addEventListener("click", () =>
          this.toggleFolderFieldsSection(),
        );
        toggle.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.toggleFolderFieldsSection();
          }
        });
      }
    },

    /**
     * Parse filename to extract potential metadata
     * @param {string} filename - The filename (without path)
     * @returns {Object} Parsed suggestions { title, artist, album, track }
     */
    parseFilename(filename) {
      const suggestions = {};

      // Remove extension
      let name = filename.replace(/\.[^.]+$/, "");

      // Check for track number at start
      const trackMatch = name.match(TRACK_NUMBER_PATTERN);
      if (trackMatch) {
        suggestions.track = trackMatch[1];
        name = name.replace(TRACK_NUMBER_PATTERN, "");
      }

      // Split by common delimiters
      const parts = name
        .split(FILENAME_DELIMITERS)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (parts.length === 0) {
        return suggestions;
      }

      // Common patterns:
      // 1. "Title - Artist"
      // 2. "Title - Artist - Album"
      // 3. "Track - Title"
      // 4. Just "Title"

      if (parts.length === 1) {
        // Just the title
        suggestions.title = parts[0];
      } else if (parts.length === 2) {
        // "Title - Artist" pattern
        suggestions.title = parts[0];
        suggestions.artist = parts[1];
      } else if (parts.length >= 3) {
        // "Title - Artist - Album" pattern
        suggestions.title = parts[0];
        suggestions.artist = parts[1];
        suggestions.album = parts.slice(2).join(" - ");
      }

      return suggestions;
    },

    /**
     * Render filename suggestions
     * @param {string} filePath - Current file path
     * @param {Object} currentMetadata - Current file's metadata
     */
    renderFilenameSuggestions(filePath, currentMetadata) {
      const section = document.getElementById("filename-suggestions-section");
      const container = document.getElementById(
        "filename-suggestions-container",
      );

      if (!section || !container) return;

      // Get filename from path
      const filename = filePath.split("/").pop();
      const suggestions = this.parseFilename(filename);

      // Filter out suggestions that match existing values
      const validSuggestions = [];

      const fieldLabels = {
        track: "Track",
        artist: "Artist",
        album: "Album",
        title: "Title",
      };

      Object.entries(suggestions).forEach(([field, value]) => {
        if (!value) return;

        // Get current value from metadata
        const currentValue = currentMetadata[field] || "";

        // Only suggest if different from current (and current is empty or different)
        if (value.toLowerCase() !== currentValue.toLowerCase()) {
          validSuggestions.push({
            field,
            label: fieldLabels[field] || field,
            value,
            currentValue,
          });
        }
      });

      // Hide section if no valid suggestions
      if (validSuggestions.length === 0) {
        section.style.display = "none";
        return;
      }

      // Show section and render
      section.style.display = "block";
      container.innerHTML = "";

      // Sort: prioritize empty fields first, then by field order
      const fieldOrder = ["artist", "album", "title", "track"];
      validSuggestions.sort((a, b) => {
        const aEmpty = !a.currentValue;
        const bEmpty = !b.currentValue;
        if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
        return fieldOrder.indexOf(a.field) - fieldOrder.indexOf(b.field);
      });

      validSuggestions.forEach((suggestion) => {
        const item = document.createElement("div");
        item.className = "filename-suggestion-item";
        item.dataset.field = suggestion.field;
        item.dataset.value = suggestion.value;

        const actionText = suggestion.currentValue ? "Update" : "Set";

        item.innerHTML = `
          <span class="filename-suggestion-field">${this.escapeHtml(suggestion.label)}</span>
          <span class="filename-suggestion-value">${this.escapeHtml(suggestion.value)}</span>
          <span class="filename-suggestion-action">${actionText} →</span>
        `;

        if (suggestion.currentValue) {
          item.title = `Current: "${suggestion.currentValue}" → New: "${suggestion.value}"`;
        } else {
          item.title = `Set ${suggestion.label} to "${suggestion.value}"`;
        }

        item.addEventListener("click", () =>
          this.applyFilenameSuggestion(
            suggestion.field,
            suggestion.value,
            item,
          ),
        );

        container.appendChild(item);
      });
    },

    /**
     * Apply a filename suggestion to a field
     * @param {string} field - Field ID (title, artist, album, track)
     * @param {string} value - Value to set
     * @param {HTMLElement} itemElement - The clicked item element for visual feedback
     */
    async applyFilenameSuggestion(field, value, itemElement) {
      const input = document.getElementById(field);

      if (input) {
        // Field exists in DOM - just update the value
        input.value = value;

        // Dispatch input event to trigger change tracking
        const event = new Event("input", { bubbles: true });
        input.dispatchEvent(event);

        // Visual feedback on the suggestion item
        this.markSuggestionApplied(itemElement);

        // Flash the input field
        input.classList.add("field-updated");
        setTimeout(() => input.classList.remove("field-updated"), 300);
      } else {
        // Field doesn't exist in DOM - need to create it via API
        if (!State.currentFile) {
          console.warn("No current file selected");
          return;
        }

        try {
          // Show loading state
          if (itemElement) {
            const actionSpan = itemElement.querySelector(
              ".filename-suggestion-action",
            );
            if (actionSpan) {
              actionSpan.textContent = "Adding...";
            }
          }

          // Create the field via API
          const result = await API.createField(State.currentFile, field, value);

          if (result.status === "success") {
            // Mark as applied
            this.markSuggestionApplied(itemElement);

            // Reload the file to show the new field in the form
            if (
              window.MetadataRemote.Files &&
              window.MetadataRemote.Files.Manager
            ) {
              await window.MetadataRemote.Files.Manager.loadFile(
                State.currentFile,
                State.selectedListItem,
              );
            }
          } else {
            // Show error
            if (itemElement) {
              const actionSpan = itemElement.querySelector(
                ".filename-suggestion-action",
              );
              if (actionSpan) {
                actionSpan.textContent = "Failed";
              }
              itemElement.classList.add("error");
            }
            console.error("Failed to create field:", result.error);
          }
        } catch (err) {
          console.error("Error creating field:", err);
          if (itemElement) {
            const actionSpan = itemElement.querySelector(
              ".filename-suggestion-action",
            );
            if (actionSpan) {
              actionSpan.textContent = "Error";
            }
          }
        }
      }
    },

    /**
     * Mark a suggestion item as applied (visual feedback)
     * @param {HTMLElement} itemElement - The suggestion item element
     */
    markSuggestionApplied(itemElement) {
      if (itemElement) {
        itemElement.classList.add("applied");
        const actionSpan = itemElement.querySelector(
          ".filename-suggestion-action",
        );
        if (actionSpan) {
          actionSpan.textContent = "✓ Applied";
        }
      }
    },

    /**
     * Render common fields quick-add section
     * @param {Object} currentMetadata - Current file's metadata
     */
    renderCommonFields(currentMetadata) {
      const section = document.getElementById("common-fields-section");
      const container = document.getElementById("common-fields-container");

      if (!section || !container) return;

      // Get current file's existing fields (normalized to lowercase)
      const existingFields = new Set();

      // Check standard fields from metadata
      const standardFieldKeys = [
        "title",
        "artist",
        "album",
        "albumartist",
        "date",
        "genre",
        "composer",
        "track",
        "disc",
      ];

      standardFieldKeys.forEach((field) => {
        const value = currentMetadata[field];
        if (value !== null && value !== undefined && value !== "") {
          existingFields.add(field.toLowerCase());
        }
      });

      // Check extended/all fields
      if (currentMetadata.all_fields) {
        Object.keys(currentMetadata.all_fields).forEach((field) => {
          existingFields.add(field.toLowerCase());
        });
      }

      // Filter to common fields that don't exist yet
      const missingFields = commonFields.filter(
        (f) => !existingFields.has(f.id.toLowerCase()),
      );

      // Hide section if no missing fields
      if (missingFields.length === 0) {
        section.style.display = "none";
        return;
      }

      // Show section and render badges
      section.style.display = "block";
      container.innerHTML = "";

      missingFields.forEach((field) => {
        const badge = document.createElement("button");
        badge.className = "common-field-badge";
        badge.type = "button";
        badge.dataset.field = field.id;

        badge.innerHTML = `
          <span class="badge-icon">+</span>
          <span class="badge-name">${this.escapeHtml(field.name)}</span>
        `;

        badge.title = `Add ${field.name} field`;

        badge.addEventListener("click", () =>
          this.addCommonField(field.id, field.name),
        );

        container.appendChild(badge);
      });
    },

    /**
     * Add a common field to the metadata form
     * @param {string} fieldId - Field ID
     * @param {string} fieldName - Field display name
     */
    addCommonField(fieldId, fieldName) {
      if (!State.currentFile) return;

      const Editor = window.MetadataRemote.Metadata.Editor;

      // Pre-fill the new field form
      const nameInput = document.getElementById("new-field-name");
      const valueInput = document.getElementById("new-field-value");

      if (nameInput && valueInput) {
        nameInput.value = fieldId;
        valueInput.value = "";

        // Expand the new field form if collapsed
        const form = document.getElementById("new-field-form");
        const header = document.querySelector(".new-field-header");
        const icon = document.querySelector(".new-field-header .expand-icon");

        if (form && form.style.display === "none") {
          form.style.display = "block";
          if (icon) icon.textContent = "▼";
          if (header) {
            header.setAttribute("aria-expanded", "true");
            header.classList.add("expanded");
          }
        }

        // Focus the value input
        valueInput.focus();
      }
    },

    /**
     * Load folder fields for the current file's folder
     * @param {string} filePath - Current file path
     * @param {Object} currentMetadata - Current file's metadata
     */
    async loadFolderFields(filePath, currentMetadata) {
      if (!filePath) return;

      // Render filename suggestions first (instant, no API call)
      this.renderFilenameSuggestions(filePath, currentMetadata);

      // Render common fields (doesn't need API call)
      this.renderCommonFields(currentMetadata);

      const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));

      // Check cache first
      if (
        folderFieldsCache.has(folderPath) &&
        currentFolderPath === folderPath
      ) {
        this.renderFolderFieldSuggestions(
          folderFieldsCache.get(folderPath),
          currentMetadata,
        );
        return;
      }

      currentFolderPath = folderPath;

      try {
        const result = await API.call(
          `/folder-fields/${encodeURIComponent(folderPath)}`,
        );

        if (result.status === "success" && result.fields) {
          folderFieldsCache.set(folderPath, result.fields);
          State.folderFieldSuggestions[folderPath] = result.fields;
          this.renderFolderFieldSuggestions(result.fields, currentMetadata);
        }
      } catch (err) {
        console.error("Error loading folder fields:", err);
        this.hideFolderFieldsSection();
      }
    },

    /**
     * Clear the folder fields cache
     * @param {string} folderPath - Optional specific folder to clear
     */
    clearCache(folderPath) {
      if (folderPath) {
        folderFieldsCache.delete(folderPath);
        delete State.folderFieldSuggestions[folderPath];
      } else {
        folderFieldsCache.clear();
        State.folderFieldSuggestions = {};
      }
    },

    /**
     * Render folder field suggestions
     * @param {Object} folderFields - { fieldName: { count, totalFiles, sampleValues } }
     * @param {Object} currentMetadata - Current file's metadata
     */
    renderFolderFieldSuggestions(folderFields, currentMetadata) {
      const container = document.getElementById("folder-fields-container");
      const toggle = document.querySelector(".folder-fields-toggle");
      const section = document.getElementById("folder-fields-wrapper");

      if (!container) return;

      // Get current file's existing fields
      const existingFields = new Set();
      const standardFields = [
        "title",
        "artist",
        "album",
        "albumartist",
        "date",
        "genre",
        "composer",
        "track",
        "disc",
      ];

      // Check standard fields
      standardFields.forEach((field) => {
        if (
          currentMetadata[field] ||
          (currentMetadata.existing_standard_fields &&
            currentMetadata.existing_standard_fields[field])
        ) {
          existingFields.add(field.toLowerCase());
        }
      });

      // Check extended fields
      if (currentMetadata.all_fields) {
        Object.keys(currentMetadata.all_fields).forEach((field) => {
          existingFields.add(field.toLowerCase());
        });
      }

      // Filter to fields that exist in other files but not in current file
      const suggestions = [];

      Object.entries(folderFields).forEach(([fieldName, fieldInfo]) => {
        const normalizedName = fieldName.toLowerCase();

        // Skip if current file already has this field
        if (existingFields.has(normalizedName)) {
          return;
        }

        // Skip fields that are in less than 2 files (not really "common")
        if (fieldInfo.count < 2) {
          return;
        }

        suggestions.push({
          fieldName: fieldName,
          displayName: fieldInfo.displayName || fieldName,
          count: fieldInfo.count,
          totalFiles: fieldInfo.totalFiles,
          sampleValues: fieldInfo.sampleValues || [],
          mostCommonValue: fieldInfo.mostCommonValue,
        });
      });

      // Sort by count (most common first)
      suggestions.sort((a, b) => b.count - a.count);

      // Show/hide the section based on whether there are suggestions
      if (suggestions.length === 0) {
        this.hideFolderFieldsSection();
        return;
      }

      // Show the toggle
      if (toggle) {
        toggle.style.display = "flex";
      }

      // Render suggestions
      container.innerHTML = "";

      const introText = document.createElement("p");
      introText.className = "folder-fields-intro";
      introText.textContent = "Fields used in other files in this folder:";
      container.appendChild(introText);

      const badgesContainer = document.createElement("div");
      badgesContainer.className = "folder-fields-badges";

      suggestions.slice(0, 10).forEach((suggestion) => {
        const badge = document.createElement("button");
        badge.className = "folder-field-badge";
        badge.type = "button";
        badge.dataset.field = suggestion.fieldName;
        badge.dataset.value = suggestion.mostCommonValue || "";

        const percentage = Math.round(
          (suggestion.count / suggestion.totalFiles) * 100,
        );

        badge.innerHTML = `
                    <span class="badge-icon">+</span>
                    <span class="badge-name">${this.escapeHtml(suggestion.displayName)}</span>
                    <span class="badge-count">(${suggestion.count}/${suggestion.totalFiles})</span>
                `;

        badge.title = suggestion.mostCommonValue
          ? `Add "${suggestion.fieldName}" - Common value: "${suggestion.mostCommonValue}"`
          : `Add "${suggestion.fieldName}" field`;

        badge.addEventListener("click", () =>
          this.addFieldFromSuggestion(suggestion),
        );

        badgesContainer.appendChild(badge);
      });

      container.appendChild(badgesContainer);

      // Add "show more" if there are more suggestions
      if (suggestions.length > 10) {
        const moreLink = document.createElement("button");
        moreLink.className = "folder-fields-more";
        moreLink.type = "button";
        moreLink.textContent = `+${suggestions.length - 10} more fields`;
        moreLink.addEventListener("click", () =>
          this.showAllSuggestions(suggestions),
        );
        container.appendChild(moreLink);
      }
    },

    /**
     * Hide the folder fields section
     */
    hideFolderFieldsSection() {
      const toggle = document.querySelector(".folder-fields-toggle");
      const section = document.getElementById("folder-fields-wrapper");

      if (toggle) toggle.style.display = "none";
      if (section) section.style.display = "none";
    },

    /**
     * Toggle folder fields section visibility
     */
    toggleFolderFieldsSection() {
      const wrapper = document.getElementById("folder-fields-wrapper");
      const toggle = document.querySelector(".folder-fields-toggle");
      const icon = toggle?.querySelector(".expand-icon");

      if (!wrapper || !toggle) return;

      if (wrapper.style.display === "none") {
        wrapper.style.display = "block";
        toggle.classList.add("expanded");
        toggle.setAttribute("aria-expanded", "true");
        if (icon) icon.textContent = "▼";
      } else {
        wrapper.style.display = "none";
        toggle.classList.remove("expanded");
        toggle.setAttribute("aria-expanded", "false");
        if (icon) icon.textContent = "▶";
      }
    },

    /**
     * Add a field from suggestion
     * @param {Object} suggestion - Field suggestion object
     */
    async addFieldFromSuggestion(suggestion) {
      if (!State.currentFile) return;

      const Editor = window.MetadataRemote.Metadata.Editor;

      // Pre-fill the new field form
      const nameInput = document.getElementById("new-field-name");
      const valueInput = document.getElementById("new-field-value");

      if (nameInput && valueInput) {
        nameInput.value = suggestion.fieldName;
        valueInput.value = suggestion.mostCommonValue || "";

        // Expand the new field form if collapsed
        const form = document.getElementById("new-field-form");
        const header = document.querySelector(".new-field-header");
        const icon = document.querySelector(".new-field-header .expand-icon");

        if (form && form.style.display === "none") {
          form.style.display = "block";
          if (icon) icon.textContent = "▼";
          if (header) {
            header.setAttribute("aria-expanded", "true");
            header.classList.add("expanded");
          }
        }

        // Focus the value input so user can modify if needed
        valueInput.focus();
        valueInput.select();
      }
    },

    /**
     * Show all field suggestions in a modal or expanded view
     * @param {Array} suggestions - All suggestions
     */
    showAllSuggestions(suggestions) {
      // For now, just expand to show all in the container
      const container = document.getElementById("folder-fields-container");
      const badgesContainer = container?.querySelector(".folder-fields-badges");
      const moreLink = container?.querySelector(".folder-fields-more");

      if (!badgesContainer) return;

      // Add remaining badges
      suggestions.slice(10).forEach((suggestion) => {
        const badge = document.createElement("button");
        badge.className = "folder-field-badge";
        badge.type = "button";
        badge.dataset.field = suggestion.fieldName;
        badge.dataset.value = suggestion.mostCommonValue || "";

        badge.innerHTML = `
                    <span class="badge-icon">+</span>
                    <span class="badge-name">${this.escapeHtml(suggestion.displayName)}</span>
                    <span class="badge-count">(${suggestion.count}/${suggestion.totalFiles})</span>
                `;

        badge.title = suggestion.mostCommonValue
          ? `Add "${suggestion.fieldName}" - Common value: "${suggestion.mostCommonValue}"`
          : `Add "${suggestion.fieldName}" field`;

        badge.addEventListener("click", () =>
          this.addFieldFromSuggestion(suggestion),
        );

        badgesContainer.appendChild(badge);
      });

      // Remove "show more" link
      if (moreLink) moreLink.remove();
    },

    /**
     * Escape HTML for safe display
     * @param {string} unsafe - Unsafe string
     * @returns {string} Escaped string
     */
    escapeHtml(unsafe) {
      if (unsafe === null || unsafe === undefined) return "";
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },
  };
})();
