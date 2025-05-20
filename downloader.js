// ==UserScript==
// @name         Canvas File Downloader v6 (Simplified UI)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Download Canvas files with folder structure and minimal SVG UI
// @match        https://oc.sjtu.edu.cn/courses/*/files*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @connect      oc.sjtu.edu.cn
// ==/UserScript==

(function () {
    'use strict';

    const COURSE_ID = window.location.pathname.match(/courses\/(\d+)/)[1];
    const STORAGE_KEY = `canvas_downloaded_file_map_${COURSE_ID}`;
    const courseNameEl = document.querySelectorAll('#breadcrumbs a > span.ellipsible')[1];
    const COURSE_FOLDER = courseNameEl?.innerText.trim() || `Course_${COURSE_ID}`;
    const API_FILES = `https://oc.sjtu.edu.cn/api/v1/courses/${COURSE_ID}/files?per_page=100`;
    const API_FOLDERS = `https://oc.sjtu.edu.cn/api/v1/folders/`;

    const folderPathCache = {};

    function sanitizePath(path) {
        return path.replace(/[:*?"<>|\\]/g, "_");
    }

    function loadDownloadMap() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    }

    function saveDownloadMap(map) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }

    function viewDownloadedIDs() {
        const map = loadDownloadMap();
        const entries = Object.entries(map);
        if (entries.length === 0) return alert("No files have been downloaded yet.");

        entries.sort((a, b) => new Date(a[1].time) - new Date(b[1].time));

        const overlay = document.createElement('div');
        overlay.style.cssText = `position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.4); z-index: 99999;
            display: flex; justify-content: center; align-items: center;`;

        const box = document.createElement('div');
        box.style.cssText = `position: relative; background: white; padding: 20px;
            border-radius: 8px; width: 600px; max-height: 85vh; overflow-y: auto;
            font-family: sans-serif; box-shadow: 0 0 10px rgba(0,0,0,0.3);`;

        const escListener = (e) => {
            if (e.key === "Escape") {
                document.body.removeChild(overlay);
                window.removeEventListener("keydown", escListener);
            }
        };
        window.addEventListener("keydown", escListener);

        const titleBar = document.createElement('div');
        titleBar.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;`;

        const title = document.createElement('h3');
        title.textContent = `Downloaded Files for ${COURSE_FOLDER}`;
        title.style.margin = 0;

        const close = document.createElement('button');
        close.textContent = "×";
        close.title = "Close";
        close.style.cssText = `background: none; border: none; font-size: 20px; font-weight: bold; cursor: pointer;`;
        close.onclick = () => {
            document.body.removeChild(overlay);
            window.removeEventListener("keydown", escListener);
        };

        titleBar.appendChild(title);
        titleBar.appendChild(close);
        box.appendChild(titleBar);

        const actionBar = document.createElement('div');
        actionBar.style.cssText = `margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;`;

        const selectAll = document.createElement('input');
        selectAll.type = 'checkbox';
        selectAll.title = "Select All";

        const deleteButton = document.createElement('button');
        deleteButton.textContent = "Delete Selected";
        deleteButton.style.cssText = `border: 1px solid #999; padding: 4px 8px; background: none; cursor: pointer;`;

        const selectedIDs = new Set();

        deleteButton.onclick = () => {
            if (selectedIDs.size === 0) return alert("No files selected.");
            if (!confirm(`Delete ${selectedIDs.size} selected file(s)?`)) return;
            for (const id of selectedIDs) delete map[id];
            saveDownloadMap(map);
            overlay.remove();
            viewDownloadedIDs();
        };

        actionBar.appendChild(selectAll);
        actionBar.appendChild(deleteButton);
        box.appendChild(actionBar);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search by filename...';
        searchInput.style.cssText = `width: 100%; padding: 8px; margin: 10px 0 12px;
            border-radius: 5px; border: 1px solid #ccc; font-size: 14px;`;
        box.appendChild(searchInput);

        const fileList = document.createElement('div');
        box.appendChild(fileList);

        const renderFileList = (filter = '') => {
            fileList.innerHTML = '';
            const boxes = [];
            entries.forEach(([id, data]) => {
                if (!data.name.toLowerCase().includes(filter.toLowerCase())) return;

                const row = document.createElement('div');
                row.style.cssText = `margin-bottom: 10px; display: flex; align-items: center; gap: 8px;`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = selectedIDs.has(id);
                checkbox.onclick = () => {
                    if (checkbox.checked) selectedIDs.add(id);
                    else selectedIDs.delete(id);
                };
                boxes.push({ checkbox, id });

                const label = document.createElement('div');
                label.innerHTML = `<strong>${data.name}</strong><br><small>Downloaded at: ${data.time}</small>`;
                label.style.flex = "1";

                row.appendChild(checkbox);
                row.appendChild(label);
                fileList.appendChild(row);
            });
            selectAll.onclick = () => {
                boxes.forEach(({ checkbox, id }) => {
                    checkbox.checked = selectAll.checked;
                    if (selectAll.checked) selectedIDs.add(id);
                    else selectedIDs.delete(id);
                });
            };
        };

        renderFileList();
        searchInput.addEventListener('input', () => renderFileList(searchInput.value));

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function getFolderPath(folder_id, callback) {
        if (folder_id == null) return callback('');
        if (folderPathCache[folder_id]) return callback(folderPathCache[folder_id]);
        GM_xmlhttpRequest({
            method: 'GET', url: API_FOLDERS + folder_id,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) {
                    const folder = JSON.parse(res.responseText);
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

    function fetchCanvasFiles(callback) {
        GM_xmlhttpRequest({
            method: 'GET', url: API_FILES,
            headers: { 'Accept': 'application/json' },
            onload: function (res) {
                if (res.status === 200) callback(JSON.parse(res.responseText));
                else alert("Failed to load file list.");
            }
        });
    }

    function checkAndDownload() {
        const downloadedMap = loadDownloadMap();
        fetchCanvasFiles(files => {
            const newFiles = files.filter(f => !(f.id in downloadedMap));
            if (newFiles.length === 0) return alert("No new files found.");

            let completed = 0;
            newFiles.forEach(file => {
                getFolderPath(file.folder_id, folderPath => {
                    const relativePath = sanitizePath(`${COURSE_FOLDER}/${folderPath}${file.display_name}`);
                    console.log("Downloading:", relativePath);
                    GM_download({ url: file.url, name: relativePath });
                    downloadedMap[file.id] = {
                        name: file.display_name,
                        time: new Date().toLocaleString()
                    };
                    completed++;
                    if (completed === newFiles.length) {
                        saveDownloadMap(downloadedMap);
                        alert(`Downloaded ${completed} new file(s).`);
                    }
                });
            });
        });
    }

    GM_registerMenuCommand("Check & Download New Files", checkAndDownload);
    GM_registerMenuCommand("View Downloaded Files", viewDownloadedIDs);
})();
