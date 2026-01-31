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
 * Audio Player Management for Metadata Remote
 * Handles audio playback controls and state including full player bar
 */

(function () {
  // Create namespace if it doesn't exist
  window.MetadataRemote = window.MetadataRemote || {};
  window.MetadataRemote.Audio = window.MetadataRemote.Audio || {};

  // Create shortcuts
  const State = window.MetadataRemote.State;
  const UIUtils = window.MetadataRemote.UI.Utilities;

  window.MetadataRemote.Audio.Player = {
    audioPlayer: null,

    // Player bar elements
    playerBar: null,
    playPauseBtn: null,
    prevBtn: null,
    nextBtn: null,
    progressSlider: null,
    volumeSlider: null,
    volumeBtn: null,
    currentTimeDisplay: null,
    durationDisplay: null,
    trackNameDisplay: null,

    // Internal state
    isSeeking: false,

    /**
     * Initialize the audio player
     * @param {HTMLAudioElement} audioElement - The audio element from the DOM
     */
    init(audioElement) {
      this.audioPlayer = audioElement;
      this.setupEventListeners();
      this.initPlayerBar();
      this.setupKeyboardShortcuts();
    },

    /**
     * Set up global keyboard shortcuts for audio playback
     */
    setupKeyboardShortcuts() {
      document.addEventListener("keydown", (e) => {
        // Don't trigger when typing in inputs or textareas
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          return;
        }

        // Don't trigger when help box is open
        if (State.helpBoxOpen) {
          return;
        }

        // Space bar for play/pause (only when not in input fields)
        if (e.key === " " && !e.ctrlKey && !e.altKey && !e.metaKey) {
          // Only handle space if we have a playing file or selected file
          if (State.currentlyPlayingFile || State.currentFile) {
            e.preventDefault();
            if (State.currentlyPlayingFile) {
              this.toggleCurrentPlayback();
            } else if (State.currentFile) {
              this.playFile(State.currentFile);
            }
          }
        }

        // Arrow left/right for seeking (5 seconds) when holding Shift
        if (State.currentlyPlayingFile && e.shiftKey) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            this.seek(State.currentTime - 5);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            this.seek(State.currentTime + 5);
          }
        }
      });
    },

    /**
     * Initialize player bar elements and their event listeners
     */
    initPlayerBar() {
      // Get player bar elements
      this.playerBar = document.getElementById("audio-player-bar");
      this.playPauseBtn = document.getElementById("player-play-pause");
      this.prevBtn = document.getElementById("player-prev");
      this.nextBtn = document.getElementById("player-next");
      this.progressSlider = document.getElementById("player-progress");
      this.volumeSlider = document.getElementById("player-volume");
      this.volumeBtn = document.getElementById("player-volume-btn");
      this.currentTimeDisplay = document.getElementById("player-current-time");
      this.durationDisplay = document.getElementById("player-duration");
      this.trackNameDisplay = document.getElementById("player-track-name");

      if (!this.playerBar) return;

      // Set initial volume from state
      this.audioPlayer.volume = State.volume;
      if (this.volumeSlider) {
        this.volumeSlider.value = State.volume * 100;
      }
      this.updateVolumeIcon();

      // Play/Pause button
      if (this.playPauseBtn) {
        this.playPauseBtn.addEventListener("click", () => {
          if (State.currentlyPlayingFile) {
            this.toggleCurrentPlayback();
          } else if (State.currentFile) {
            // If no track playing but a file is selected, play it
            this.playFile(State.currentFile);
          }
        });
      }

      // Previous/Next buttons
      if (this.prevBtn) {
        this.prevBtn.addEventListener("click", () => this.playPrevious());
      }
      if (this.nextBtn) {
        this.nextBtn.addEventListener("click", () => this.playNext());
      }

      // Progress slider
      if (this.progressSlider) {
        this.progressSlider.addEventListener("input", () => {
          this.isSeeking = true;
          const time = (this.progressSlider.value / 100) * State.duration;
          this.currentTimeDisplay.textContent = this.formatTime(time);
        });

        this.progressSlider.addEventListener("change", () => {
          const time = (this.progressSlider.value / 100) * State.duration;
          this.seek(time);
          this.isSeeking = false;
        });
      }

      // Volume slider
      if (this.volumeSlider) {
        this.volumeSlider.addEventListener("input", () => {
          const volume = this.volumeSlider.value / 100;
          this.setVolume(volume);
        });
      }

      // Volume mute button
      if (this.volumeBtn) {
        this.volumeBtn.addEventListener("click", () => this.toggleMute());
      }
    },

    /**
     * Set up audio player event listeners
     */
    setupEventListeners() {
      this.audioPlayer.addEventListener("ended", () => {
        // Auto-play next track
        this.playNext();
      });

      this.audioPlayer.addEventListener("error", (e) => {
        // Only show error if we're actually trying to play something
        if (State.currentlyPlayingFile && this.audioPlayer.src) {
          console.error("Audio playback error:", e);
          this.stopPlayback();
          UIUtils.showStatus("Error playing audio file", "error");
        }
      });

      this.audioPlayer.addEventListener("timeupdate", () => {
        if (!this.isSeeking) {
          State.currentTime = this.audioPlayer.currentTime;
          this.updateProgressUI();
        }
      });

      this.audioPlayer.addEventListener("loadedmetadata", () => {
        State.duration = this.audioPlayer.duration;
        this.updateDurationUI();
      });

      this.audioPlayer.addEventListener("play", () => {
        State.isPlaying = true;
        this.updatePlayPauseUI();
      });

      this.audioPlayer.addEventListener("pause", () => {
        State.isPlaying = false;
        this.updatePlayPauseUI();
      });
    },

    /**
     * Format time in seconds to MM:SS
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
      if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    },

    /**
     * Update progress slider and time display
     */
    updateProgressUI() {
      if (!this.progressSlider || !this.currentTimeDisplay) return;

      const progress = State.duration
        ? (State.currentTime / State.duration) * 100
        : 0;
      this.progressSlider.value = progress;
      this.currentTimeDisplay.textContent = this.formatTime(State.currentTime);

      // Update slider background for filled portion
      this.progressSlider.style.setProperty("--progress", `${progress}%`);
    },

    /**
     * Update duration display
     */
    updateDurationUI() {
      if (!this.durationDisplay) return;
      this.durationDisplay.textContent = this.formatTime(State.duration);
    },

    /**
     * Update play/pause button icon
     */
    updatePlayPauseUI() {
      if (!this.playPauseBtn) return;

      const playIcon = this.playPauseBtn.querySelector(".play-icon");
      const pauseIcon = this.playPauseBtn.querySelector(".pause-icon");

      if (State.isPlaying) {
        playIcon.style.display = "none";
        pauseIcon.style.display = "block";
        this.playPauseBtn.title = "Pause";
      } else {
        playIcon.style.display = "block";
        pauseIcon.style.display = "none";
        this.playPauseBtn.title = "Play";
      }
    },

    /**
     * Update volume icon based on current volume/mute state
     */
    updateVolumeIcon() {
      if (!this.volumeBtn) return;

      const volumeIcon = this.volumeBtn.querySelector(".volume-icon");
      const mutedIcon = this.volumeBtn.querySelector(".volume-muted-icon");

      if (State.isMuted || State.volume === 0) {
        volumeIcon.style.display = "none";
        mutedIcon.style.display = "block";
      } else {
        volumeIcon.style.display = "block";
        mutedIcon.style.display = "none";
      }
    },

    /**
     * Update track name in player bar
     * @param {string} filepath - Full file path
     */
    updateTrackName(filepath) {
      if (!this.trackNameDisplay) return;

      if (filepath) {
        const filename = filepath.split("/").pop();
        this.trackNameDisplay.textContent = filename;
        this.trackNameDisplay.title = filename;
      } else {
        this.trackNameDisplay.textContent = "No track playing";
        this.trackNameDisplay.title = "";
      }
    },

    /**
     * Play a specific file
     * @param {string} filepath - Path to the audio file
     */
    playFile(filepath) {
      // Safety check - prevent WMA playback
      if (filepath.toLowerCase().endsWith(".wma")) {
        console.warn("WMA playback attempted but blocked");
        UIUtils.showStatus("WMA files cannot be played in browser", "warning");
        return;
      }

      this.stopPlayback();
      State.currentlyPlayingFile = filepath;

      // Update track name
      this.updateTrackName(filepath);

      // Check if it's a WavPack file
      const isWavPack = filepath.toLowerCase().endsWith(".wv");
      const streamUrl = isWavPack
        ? `/stream/wav/${encodeURIComponent(filepath)}`
        : `/stream/${encodeURIComponent(filepath)}`;

      this.audioPlayer.src = streamUrl;
      this.audioPlayer
        .play()
        .then(() => {
          this.syncFileListButton(filepath, true);
        })
        .catch((err) => {
          console.error("Error playing audio:", err);
          UIUtils.showStatus("Error playing audio file", "error");
          this.stopPlayback();
        });
    },

    /**
     * Toggle playback for a file (from file list button)
     * @param {string} filepath - Path to the audio file
     * @param {HTMLElement} button - The play button element
     */
    togglePlayback(filepath, button) {
      // Safety check - prevent WMA playback
      if (filepath.toLowerCase().endsWith(".wma")) {
        console.warn("WMA playback attempted but blocked");
        return;
      }

      if (State.currentlyPlayingFile === filepath && !this.audioPlayer.paused) {
        this.audioPlayer.pause();
        button.classList.remove("playing");
      } else {
        this.stopPlayback();
        State.currentlyPlayingFile = filepath;

        // Update track name
        this.updateTrackName(filepath);

        button.classList.add("loading");
        button.classList.remove("playing");

        // Check if it's a WavPack file
        const isWavPack = filepath.toLowerCase().endsWith(".wv");
        const streamUrl = isWavPack
          ? `/stream/wav/${encodeURIComponent(filepath)}`
          : `/stream/${encodeURIComponent(filepath)}`;

        this.audioPlayer.src = streamUrl;
        this.audioPlayer
          .play()
          .then(() => {
            button.classList.remove("loading");
            button.classList.add("playing");
          })
          .catch((err) => {
            console.error("Error playing audio:", err);
            button.classList.remove("loading");
            UIUtils.showStatus("Error playing audio file", "error");
            this.stopPlayback();
          });
      }
    },

    /**
     * Toggle play/pause for current track
     */
    toggleCurrentPlayback() {
      if (this.audioPlayer.paused) {
        this.audioPlayer.play();
      } else {
        this.audioPlayer.pause();
      }
      // Sync file list button
      this.syncFileListButton(
        State.currentlyPlayingFile,
        !this.audioPlayer.paused,
      );
    },

    /**
     * Seek to a specific time
     * @param {number} time - Time in seconds
     */
    seek(time) {
      if (isNaN(time) || !isFinite(time)) return;
      this.audioPlayer.currentTime = Math.max(
        0,
        Math.min(time, State.duration),
      );
    },

    /**
     * Set volume level
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
      State.volume = Math.max(0, Math.min(1, volume));
      State.isMuted = false;
      this.audioPlayer.volume = State.volume;

      // Persist to localStorage
      localStorage.setItem("audioVolume", State.volume.toString());

      this.updateVolumeIcon();

      // Update slider if not called from slider
      if (this.volumeSlider && this.volumeSlider.value / 100 !== volume) {
        this.volumeSlider.value = State.volume * 100;
      }
    },

    /**
     * Toggle mute state
     */
    toggleMute() {
      if (State.isMuted) {
        // Unmute
        State.isMuted = false;
        this.audioPlayer.volume = State.volume || 0.5;
        if (this.volumeSlider) {
          this.volumeSlider.value = (State.volume || 0.5) * 100;
        }
      } else {
        // Mute
        State.previousVolume = State.volume;
        State.isMuted = true;
        this.audioPlayer.volume = 0;
        if (this.volumeSlider) {
          this.volumeSlider.value = 0;
        }
      }
      this.updateVolumeIcon();
    },

    /**
     * Play previous track in file list
     */
    playPrevious() {
      if (!State.currentFiles || State.currentFiles.length === 0) return;

      const currentIndex = State.currentFiles.findIndex(
        (f) => f.path === State.currentlyPlayingFile,
      );

      let prevIndex;
      if (currentIndex <= 0) {
        // Wrap to end
        prevIndex = State.currentFiles.length - 1;
      } else {
        prevIndex = currentIndex - 1;
      }

      // Skip non-audio files and WMA
      let attempts = 0;
      while (attempts < State.currentFiles.length) {
        const file = State.currentFiles[prevIndex];
        if (file && !file.path.toLowerCase().endsWith(".wma")) {
          this.playFile(file.path);
          // Select the file in the list
          this.selectFileInList(file.path);
          return;
        }
        prevIndex =
          prevIndex <= 0 ? State.currentFiles.length - 1 : prevIndex - 1;
        attempts++;
      }
    },

    /**
     * Play next track in file list
     */
    playNext() {
      if (!State.currentFiles || State.currentFiles.length === 0) {
        this.stopPlayback();
        return;
      }

      const currentIndex = State.currentFiles.findIndex(
        (f) => f.path === State.currentlyPlayingFile,
      );

      let nextIndex;
      if (currentIndex < 0 || currentIndex >= State.currentFiles.length - 1) {
        // Wrap to start
        nextIndex = 0;
      } else {
        nextIndex = currentIndex + 1;
      }

      // Skip non-audio files and WMA
      let attempts = 0;
      while (attempts < State.currentFiles.length) {
        const file = State.currentFiles[nextIndex];
        if (file && !file.path.toLowerCase().endsWith(".wma")) {
          this.playFile(file.path);
          // Select the file in the list
          this.selectFileInList(file.path);
          return;
        }
        nextIndex =
          nextIndex >= State.currentFiles.length - 1 ? 0 : nextIndex + 1;
        attempts++;
      }

      // No playable files found
      this.stopPlayback();
    },

    /**
     * Select a file in the file list UI
     * @param {string} filepath - Path to select
     */
    selectFileInList(filepath) {
      const fileList = document.getElementById("file-list");
      if (!fileList) return;

      const items = fileList.querySelectorAll("li");
      items.forEach((item) => {
        if (item.dataset.filepath === filepath) {
          // Remove previous selection
          if (State.selectedListItem) {
            State.selectedListItem.classList.remove(
              "selected",
              "keyboard-focus",
            );
          }

          // Select this item
          item.classList.add("selected", "keyboard-focus");
          State.selectedListItem = item;

          // Scroll into view
          item.scrollIntoView({ behavior: "smooth", block: "nearest" });

          // Load file metadata
          if (window.AudioMetadataEditor) {
            window.AudioMetadataEditor.loadFile(filepath, item);
          }
        }
      });
    },

    /**
     * Sync file list play button state
     * @param {string} filepath - Path of file
     * @param {boolean} isPlaying - Whether file is playing
     */
    syncFileListButton(filepath, isPlaying) {
      // Clear all playing states first
      document.querySelectorAll(".play-button.playing").forEach((btn) => {
        btn.classList.remove("playing");
      });

      if (!filepath || !isPlaying) return;

      // Find the button for this file
      const fileList = document.getElementById("file-list");
      if (!fileList) return;

      const items = fileList.querySelectorAll("li");
      items.forEach((item) => {
        if (item.dataset.filepath === filepath) {
          const btn = item.querySelector(".play-button");
          if (btn) {
            btn.classList.add("playing");
          }
        }
      });
    },

    /**
     * Stop all playback
     */
    stopPlayback() {
      if (!this.audioPlayer.paused) {
        this.audioPlayer.pause();
      }
      this.audioPlayer.src = "";
      State.currentlyPlayingFile = null;
      State.isPlaying = false;
      State.currentTime = 0;
      State.duration = 0;

      // Reset UI
      this.updateTrackName(null);
      this.updatePlayPauseUI();
      if (this.progressSlider) {
        this.progressSlider.value = 0;
        this.progressSlider.style.setProperty("--progress", "0%");
      }
      if (this.currentTimeDisplay) {
        this.currentTimeDisplay.textContent = "0:00";
      }
      if (this.durationDisplay) {
        this.durationDisplay.textContent = "0:00";
      }

      document.querySelectorAll(".play-button.playing").forEach((btn) => {
        btn.classList.remove("playing");
      });
      document.querySelectorAll(".play-button.loading").forEach((btn) => {
        btn.classList.remove("loading");
      });
    },
  };
})();
