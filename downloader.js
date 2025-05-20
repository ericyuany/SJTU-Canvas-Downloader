// ==UserScript==
// @name         Canvas File Downloader (Full Version)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Download new Canvas files with proper folder structure and tracking
// @match        https://oc.sjtu.edu.cn/courses/*/files*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      oc.sjtu.edu.cn
// ==/UserScript==

(function () {
    'use strict';

    const COURSE_ID = window.location.pathname.match(/courses\/(\d+)/)[1];
    const STORAGE_KEY = `canvas_downloaded_file_ids_${COURSE_ID}`;
    const COURSE_FOLDER = COURSE_ID; // e.g., 80071
    const API_FILES = `https://oc.sjtu.edu.cn/api/v1/courses/${COURSE_ID}/files?per_page=100`;
    const API_FOLDERS = `https://oc.sjtu.edu.cn/api/v1/folders/`;

    // Load and save downloaded IDs
    function loadDownloadedIDs() {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    }

    function saveDownloadedIDs(set) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }

    function resetDownloadedIDs() {
        localStorage.removeItem(STORAGE_KEY);
        alert(`🗑️ Download history for course ${COURSE_ID} cleared.`);
    }

    function viewDownloadedIDs() {
        const set = loadDownloadedIDs();
        if (set.size === 0) {
            alert("No files have been downloaded yet.");
        } else {
            alert(`Downloaded file IDs for course ${COURSE_ID}:\n` + [...set].join(", "));
        }
    }

    // Cache to avoid repeated folder lookups
    const folderPathCache = {};

    function getFolderPath(folder_id, callback) {
        if (folder_id === null || folder_id === undefined) return callback('');
        if (folderPathCache[folder_id]) return callback(folderPathCache[folder_id]);

        GM_xmlhttpRequest({
            method: 'GET',
            url: API_FOLDERS + folder_id,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) {
                    const folder = JSON.parse(res.responseText);
                    // recursively resolve parent folders
                    getFolderPath(folder.parent_folder_id, (parentPath) => {
                        const fullPath = parentPath + folder.name + '/';
                        folderPathCache[folder_id] = fullPath;
                        callback(fullPath);
                    });
                } else {
                    console.error("Failed to fetch folder:", res);
                    callback('');
                }
            }
        });
    }

    function sanitizePath(path) {
        return path.replace(/[:*?"<>|\\]/g, "_");
    }

    function fetchCanvasFiles(callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: API_FILES,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) {
                    callback(JSON.parse(res.responseText));
                } else {
                    alert("❌ Failed to load file list.");
                }
            }
        });
    }

    function checkAndDownload() {
        const downloaded = loadDownloadedIDs();

        fetchCanvasFiles(files => {
            const newFiles = files.filter(f => !downloaded.has(f.id));
            if (newFiles.length === 0) {
                alert("✅ No new files found.");
                return;
            }

            let count = 0;
            newFiles.forEach(file => {
                getFolderPath(file.folder_id, folderPath => {
                    const fullPath = sanitizePath(`${COURSE_FOLDER}/${folderPath}${file.display_name}`);
                    console.log("📥 Downloading:", fullPath);

                    GM_download({
                        url: file.url,
                        name: fullPath,
                        onerror: () => alert(`❌ Failed to download ${file.display_name}`)
                    });

                    downloaded.add(file.id);
                    count++;
                    saveDownloadedIDs(downloaded);
                });
            });

            alert(`📥 Queued ${newFiles.length} new file(s) for download.`);
        });
    }

    // Register commands in Tampermonkey menu
    GM_registerMenuCommand("📥 Check & Download New Files", checkAndDownload);
    GM_registerMenuCommand("📋 View Downloaded File IDs", viewDownloadedIDs);
    GM_registerMenuCommand("🗑️ Reset Download History", resetDownloadedIDs);

})();
