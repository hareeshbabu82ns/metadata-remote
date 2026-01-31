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
 * Clipboard Module for Metadata Remote
 * Handles copy/paste of metadata between files
 */

(function () {
  // Create namespace if it doesn't exist
  window.MetadataRemote = window.MetadataRemote || {};
  window.MetadataRemote.Metadata = window.MetadataRemote.Metadata || {};

  // Create shortcuts
  const State = window.MetadataRemote.State;
  const API = window.MetadataRemote.API;

  // Store callbacks
  let loadHistoryCallback = null;
  let showButtonStatusCallback = null;
  let loadFileCallback = null;

  window.MetadataRemote.Metadata.Clipboard = {
    /**
     * Initialize the clipboard module
     * @param {Object} callbacks - Callback functions
     */
    init(callbacks) {
      loadHistoryCallback = callbacks.loadHistory;
      showButtonStatusCallback = callbacks.showButtonStatus;
      loadFileCallback = callbacks.loadFile;

      // Set up event listeners
      this.setupEventListeners();
    },

    /**
     * Set up event listeners for clipboard functionality
     */
    setupEventListeners() {
      // Close paste modal when clicking overlay
      const overlay = document.getElementById("paste-modal-overlay");
      if (overlay) {
        overlay.addEventListener("click", () => this.closePasteModal());
      }

      // ESC key to close modal
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const modal = document.getElementById("paste-modal");
          if (modal && modal.classList.contains("visible")) {
            this.closePasteModal();
          }
        }
      });
    },

    /**
     * Copy all metadata from the current file
     */
    async copyFromCurrentFile() {
      if (!State.currentFile) {
        console.warn("No file selected for copy");
        return;
      }

      const copyBtn = document.querySelector(".copy-metadata-btn");

      try {
        // Show processing state
        if (copyBtn) {
          copyBtn.classList.add("processing");
          copyBtn.querySelector(".btn-text").textContent = "Copying...";
        }

        // Get current metadata
        const metadata = await API.getMetadata(State.currentFile);

        // Build fields object from all_fields and standard fields
        const fields = {};
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

        // Add standard fields
        standardFields.forEach((field) => {
          if (metadata[field]) {
            fields[field] = metadata[field];
          }
        });

        // Add extended fields from all_fields
        if (metadata.all_fields) {
          Object.entries(metadata.all_fields).forEach(
            ([fieldId, fieldInfo]) => {
              if (fieldInfo.value && !standardFields.includes(fieldId)) {
                fields[fieldId] = fieldInfo.value;
              }
            },
          );
        }

        // Store in clipboard state
        State.clipboard = {
          sourceFile: State.currentFile,
          sourceFilename:
            metadata.filename || State.currentFile.split("/").pop(),
          fields: fields,
          albumArt: metadata.art || null,
          timestamp: Date.now(),
        };

        // Update UI
        this.updateClipboardIndicator();

        // Show success feedback
        if (copyBtn) {
          copyBtn.classList.remove("processing");
          copyBtn.classList.add("success");
          copyBtn.querySelector(".btn-text").textContent = "Copied!";

          setTimeout(() => {
            copyBtn.classList.remove("success");
            copyBtn.querySelector(".btn-text").textContent = "Copy";
          }, 2000);
        }

        console.log(
          `Copied ${Object.keys(fields).length} fields from ${State.clipboard.sourceFilename}`,
        );
      } catch (err) {
        console.error("Error copying metadata:", err);
        if (copyBtn) {
          copyBtn.classList.remove("processing");
          copyBtn.classList.add("error");
          copyBtn.querySelector(".btn-text").textContent = "Error";

          setTimeout(() => {
            copyBtn.classList.remove("error");
            copyBtn.querySelector(".btn-text").textContent = "Copy";
          }, 2000);
        }
      }
    },

    /**
     * Copy a single field value
     * @param {string} fieldId - Field ID to copy
     * @param {string} value - Field value
     */
    copySingleField(fieldId, value) {
      if (!State.currentFile) return;

      // Initialize clipboard if needed, preserving existing data
      if (!State.clipboard.sourceFile) {
        State.clipboard = {
          sourceFile: State.currentFile,
          sourceFilename: State.currentFile.split("/").pop(),
          fields: {},
          albumArt: null,
          timestamp: Date.now(),
        };
      }

      // Add/update just this field
      State.clipboard.fields[fieldId] = value;
      State.clipboard.timestamp = Date.now();

      this.updateClipboardIndicator();
    },

    /**
     * Check if clipboard has data
     * @returns {boolean}
     */
    hasData() {
      return (
        State.clipboard.sourceFile &&
        (Object.keys(State.clipboard.fields).length > 0 ||
          State.clipboard.albumArt)
      );
    },

    /**
     * Get clipboard field count
     * @returns {number}
     */
    getFieldCount() {
      return Object.keys(State.clipboard.fields).length;
    },

    /**
     * Update the clipboard indicator in the UI
     */
    updateClipboardIndicator() {
      const indicator = document.getElementById("clipboard-indicator");
      const pasteBtn = document.querySelector(".paste-metadata-btn");

      if (this.hasData()) {
        const fieldCount = this.getFieldCount();
        const hasArt = State.clipboard.albumArt ? 1 : 0;

        if (indicator) {
          indicator.classList.add("has-data");
          indicator.querySelector(".clipboard-count").textContent =
            fieldCount + hasArt;
          indicator.querySelector(".clipboard-source").textContent =
            State.clipboard.sourceFilename;
          indicator.style.display = "flex";
        }

        if (pasteBtn) {
          pasteBtn.disabled = false;
          pasteBtn.title = `Paste from ${State.clipboard.sourceFilename}`;
        }
      } else {
        if (indicator) {
          indicator.classList.remove("has-data");
          indicator.style.display = "none";
        }

        if (pasteBtn) {
          pasteBtn.disabled = true;
          pasteBtn.title = "No metadata in clipboard";
        }
      }
    },

    /**
     * Clear clipboard
     */
    clearClipboard() {
      State.clipboard = {
        sourceFile: null,
        sourceFilename: null,
        fields: {},
        albumArt: null,
        timestamp: null,
      };
      this.updateClipboardIndicator();
    },

    /**
     * Open the paste modal
     */
    openPasteModal() {
      if (!this.hasData()) {
        console.warn("No clipboard data to paste");
        return;
      }

      if (!State.currentFile) {
        console.warn("No file selected to paste to");
        return;
      }

      const modal = document.getElementById("paste-modal");
      const overlay = document.getElementById("paste-modal-overlay");
      const fieldsList = document.getElementById("paste-fields-list");
      const sourceInfo = document.getElementById("paste-source-info");

      if (!modal || !fieldsList) return;

      // Update source info
      if (sourceInfo) {
        sourceInfo.textContent = `From: ${State.clipboard.sourceFilename}`;
      }

      // Build fields list with checkboxes
      fieldsList.innerHTML = "";

      // Add album art checkbox if available
      if (State.clipboard.albumArt) {
        const artItem = document.createElement("div");
        artItem.className = "paste-field-item paste-field-art";
        artItem.innerHTML = `
                    <label>
                        <input type="checkbox" name="paste-field" value="__albumArt__" checked>
                        <span class="field-name">Album Art</span>
                        <span class="field-preview">[Image]</span>
                    </label>
                `;
        fieldsList.appendChild(artItem);
      }

      // Add field checkboxes
      Object.entries(State.clipboard.fields).forEach(([fieldId, value]) => {
        const item = document.createElement("div");
        item.className = "paste-field-item";

        const displayValue =
          value.length > 50 ? value.substring(0, 47) + "..." : value;
        const displayName = this.getFieldDisplayName(fieldId);

        item.innerHTML = `
                    <label>
                        <input type="checkbox" name="paste-field" value="${this.escapeHtml(fieldId)}" checked>
                        <span class="field-name">${this.escapeHtml(displayName)}</span>
                        <span class="field-preview">${this.escapeHtml(displayValue)}</span>
                    </label>
                `;
        fieldsList.appendChild(item);
      });

      // Show modal
      modal.classList.add("visible");
      if (overlay) overlay.classList.add("visible");

      // Focus first checkbox
      const firstCheckbox = fieldsList.querySelector('input[type="checkbox"]');
      if (firstCheckbox) firstCheckbox.focus();
    },

    /**
     * Close the paste modal
     */
    closePasteModal() {
      const modal = document.getElementById("paste-modal");
      const overlay = document.getElementById("paste-modal-overlay");

      if (modal) modal.classList.remove("visible");
      if (overlay) overlay.classList.remove("visible");
    },

    /**
     * Toggle all checkboxes in paste modal
     * @param {boolean} checked - Check state
     */
    toggleAllPasteFields(checked) {
      const checkboxes = document.querySelectorAll(
        '#paste-fields-list input[type="checkbox"]',
      );
      checkboxes.forEach((cb) => (cb.checked = checked));
    },

    /**
     * Get selected fields from paste modal
     * @returns {Object} { fields: {}, includeArt: boolean }
     */
    getSelectedPasteFields() {
      const checkboxes = document.querySelectorAll(
        '#paste-fields-list input[type="checkbox"]:checked',
      );
      const result = { fields: {}, includeArt: false };

      checkboxes.forEach((cb) => {
        const fieldId = cb.value;
        if (fieldId === "__albumArt__") {
          result.includeArt = true;
        } else if (State.clipboard.fields[fieldId] !== undefined) {
          result.fields[fieldId] = State.clipboard.fields[fieldId];
        }
      });

      return result;
    },

    /**
     * Paste selected fields to current file
     */
    async pasteToFile() {
      if (!State.currentFile) return;

      const { fields, includeArt } = this.getSelectedPasteFields();

      if (Object.keys(fields).length === 0 && !includeArt) {
        console.warn("No fields selected to paste");
        return;
      }

      const btn = document.getElementById("paste-to-file-btn");

      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Pasting...";
        }

        // Build data object
        const data = { ...fields };
        if (includeArt && State.clipboard.albumArt) {
          data.art = `data:image/jpeg;base64,${State.clipboard.albumArt}`;
        }

        // Apply to file
        const result = await API.setMetadata(State.currentFile, data);

        if (result.status === "success") {
          // Refresh metadata display
          if (loadFileCallback) {
            await loadFileCallback(State.currentFile);
          }

          // Refresh history
          if (loadHistoryCallback) {
            loadHistoryCallback();
          }

          this.closePasteModal();

          if (btn) {
            btn.textContent = "Pasted!";
            setTimeout(() => {
              btn.disabled = false;
              btn.textContent = "Paste to File";
            }, 2000);
          }
        } else {
          throw new Error(result.error || "Failed to paste");
        }
      } catch (err) {
        console.error("Error pasting to file:", err);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Error - Try Again";
          setTimeout(() => {
            btn.textContent = "Paste to File";
          }, 2000);
        }
      }
    },

    /**
     * Paste selected fields to all files in folder
     */
    async pasteToFolder() {
      if (!State.currentFile) return;

      const { fields, includeArt } = this.getSelectedPasteFields();

      if (Object.keys(fields).length === 0 && !includeArt) {
        console.warn("No fields selected to paste");
        return;
      }

      const btn = document.getElementById("paste-to-folder-btn");
      const folderPath = State.currentFile.substring(
        0,
        State.currentFile.lastIndexOf("/"),
      );

      try {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Pasting to folder...";
        }

        let totalUpdated = 0;
        let errors = [];

        // Apply each field to folder
        for (const [fieldId, value] of Object.entries(fields)) {
          try {
            const result = await API.applyFieldToFolder(
              folderPath,
              fieldId,
              value,
            );
            if (result.status === "success") {
              totalUpdated = Math.max(totalUpdated, result.filesUpdated || 0);
            }
          } catch (err) {
            errors.push(`${fieldId}: ${err.message}`);
          }
        }

        // Apply album art if selected
        if (includeArt && State.clipboard.albumArt) {
          try {
            const artData = `data:image/jpeg;base64,${State.clipboard.albumArt}`;
            const result = await API.applyArtToFolder(folderPath, artData);
            if (result.status === "success") {
              totalUpdated = Math.max(totalUpdated, result.filesUpdated || 0);
            }
          } catch (err) {
            errors.push(`Album art: ${err.message}`);
          }
        }

        // Refresh current file
        if (loadFileCallback) {
          await loadFileCallback(State.currentFile);
        }

        // Refresh history
        if (loadHistoryCallback) {
          loadHistoryCallback();
        }

        this.closePasteModal();

        if (btn) {
          if (errors.length > 0) {
            btn.textContent = `Partial: ${totalUpdated} files`;
          } else {
            btn.textContent = `Pasted to ${totalUpdated} files!`;
          }
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = "Paste to Folder";
          }, 3000);
        }
      } catch (err) {
        console.error("Error pasting to folder:", err);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Error - Try Again";
          setTimeout(() => {
            btn.textContent = "Paste to Folder";
          }, 2000);
        }
      }
    },

    /**
     * Get display name for a field
     * @param {string} fieldId - Field ID
     * @returns {string} Display name
     */
    getFieldDisplayName(fieldId) {
      const standardFieldsInfo = {
        title: "Title",
        artist: "Artist",
        album: "Album",
        albumartist: "Album Artist",
        composer: "Composer",
        genre: "Genre",
        track: "Track #",
        disc: "Disc #",
        date: "Year",
      };

      return standardFieldsInfo[fieldId.toLowerCase()] || fieldId;
    },

    /**
     * Escape HTML to prevent XSS
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
