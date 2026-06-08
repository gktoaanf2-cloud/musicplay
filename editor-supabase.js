// ============================================
// PAIR MUSIC BOX v3.0 — Editor ↔ Supabase Bridge
// editor.html의 master-script 뒤에 로드
// 기존 기능을 유지하면서 DB 저장/불러오기로 전환
// ============================================

(function() {
    // URL에서 플레이리스트 ID 파싱
    var params = new URLSearchParams(window.location.search);
    var PL_ID = params.get('id');

    // Supabase Storage에 이미지 업로드 → 공개 URL 반환
    async function uploadToStorage(file, path) {
        try {
            var ext = file.name.split('.').pop().toLowerCase();
            var fullPath = path + '.' + ext;
            var result = await _supabase.storage.from('covers').upload(fullPath, file, { upsert: true });
            if (result.error) { console.error('Upload error:', result.error); return null; }
            var urlResult = _supabase.storage.from('covers').getPublicUrl(fullPath);
            return urlResult.data.publicUrl;
        } catch(e) { console.error('Upload exception:', e); return null; }
    }

    // Supabase에서 플레이리스트 + 트랙 불러오기
    async function loadFromDB() {
        var plResult = await _supabase.from('playlists').select('*').eq('id', PL_ID).single();
        if (plResult.error || !plResult.data) return null;
        var pl = plResult.data;

        var trResult = await _supabase.from('tracks').select('*').eq('playlist_id', PL_ID).order('position');
        var tracks = (trResult.data || []);

        // 에디터 상태에 적용
        window.playlistData = tracks.map(function(t) {
            return { uid: t.id, videoId: t.video_id, title: t.title, image: t.image_url || undefined };
        });
        window.base64ImgData = pl.cover_image_url || '';
        window.currentFontSize = pl.font_size || 68;
        window.isBodoni = pl.is_bodoni || false;

        if (window.isBodoni) document.body.classList.add('font-bodoni');
        else document.body.classList.remove('font-bodoni');

        var pn = document.getElementById('pair-name-display');
        if (pn) { pn.textContent = pl.pair_name || 'COSMIC_BOND'; pn.style.fontSize = window.currentFontSize + 'px'; }
        var st = document.getElementById('sub-title-display');
        if (st) st.textContent = pl.sub_title || 'RECORD OF OUR GALAXY';

        ['1','2','3','4'].forEach(function(n) {
            var val = pl['color_' + n];
            if (val) {
                var c = document.getElementById('config-color-' + n);
                if (c) c.value = val;
                document.documentElement.style.setProperty('--color-' + n, val);
                var wrap = document.getElementById('cp-wrap-' + n);
                if (wrap) wrap.style.backgroundColor = val;
            }
        });

        window.renderPlaylistUI();
        window.changeLPImage(window.base64ImgData);
        if (window.resizeFit) window.resizeFit();

        return pl;
    }

    // Supabase에 저장 (디바운스)
    var dbSaveTimer = null;
    function saveToSupabase() {
        clearTimeout(dbSaveTimer);
        dbSaveTimer = setTimeout(async function() {
            try {
                var data = window.getSiteData();

                await _supabase.from('playlists').update({
                    pair_name: data.pairName,
                    sub_title: data.subTitle,
                    font_size: data.fontSize,
                    is_bodoni: data.isBodoni,
                    color_1: data.color1, color_2: data.color2,
                    color_3: data.color3, color_4: data.color4,
                    cover_image_url: data.imageData || null
                }).eq('id', PL_ID);

                await _supabase.from('tracks').delete().eq('playlist_id', PL_ID);
                if (data.playlist.length > 0) {
                    await _supabase.from('tracks').insert(
                        data.playlist.map(function(t, i) {
                            return {
                                playlist_id: PL_ID,
                                video_id: t.videoId,
                                title: t.title,
                                image_url: t.image || null,
                                position: i
                            };
                        })
                    );
                }
            } catch(e) { console.error('Save error:', e); }
        }, 1000);
    }

    // 메인 초기화 (window.load 후 실행 — 기존 initApp 이후)
    window.addEventListener('load', async function() {
        // 인증 확인
        var user = await getCurrentUser();
        if (!user) { window.location.href = 'index.html'; return; }

        // 플레이리스트 ID 없으면 대시보드로
        if (!PL_ID) { window.location.href = 'dashboard.html'; return; }

        // 소유권 확인
        var plCheck = await _supabase.from('playlists').select('user_id').eq('id', PL_ID).single();
        if (!plCheck.data || plCheck.data.user_id !== user.id) {
            alert('접근 권한이 없습니다.');
            window.location.href = 'dashboard.html';
            return;
        }

        // DB에서 불러오기
        await loadFromDB();

        // autoSave 오버라이드: localStorage + Supabase 동시 저장
        window.autoSave = function() {
            try { localStorage.setItem('pair_music_box_v53', JSON.stringify(window.getSiteData())); } catch(e) {}
            saveToSupabase();
        };

        // SHARE → 공유 링크 복사
        window.exportHtml = function() {
            var base = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
            var url = base + 'viewer.html?id=' + PL_ID;
            navigator.clipboard.writeText(url).then(function() {
                alert('공유 링크가 복사되었습니다!\n' + url);
            }).catch(function() {
                prompt('아래 링크를 복사하세요:', url);
            });
        };

        // LP 이미지 업로드 → Storage
        window.handleLpUpload = async function(e) {
            var f = e.target.files[0]; if (!f) return;
            var url = await uploadToStorage(f, PL_ID + '/cover');
            if (url) {
                window.base64ImgData = url;
                if (window.currentPlayingIndex === -1 || !window.playlistData[window.currentPlayingIndex] || !window.playlistData[window.currentPlayingIndex].image) {
                    window.changeLPImage(url);
                }
                window.autoSave();
            }
            e.target.value = '';
        };

        // 트랙 이미지 업로드 → Storage
        window.handleTrackUpload = async function(e) {
            var f = e.target.files[0];
            if (!f || !window.editingTrackUid) return;
            var url = await uploadToStorage(f, PL_ID + '/track_' + window.editingTrackUid);
            if (url) {
                var idx = window.findTrackIndex(window.editingTrackUid);
                if (idx !== -1) {
                    window.playlistData[idx].image = url;
                    if (window.currentPlayingIndex === idx) window.changeLPImage(url);
                    window.renderPlaylistUI();
                    window.autoSave();
                }
                window.editingTrackUid = null;
            }
            e.target.value = '';
        };

        // 상단 도구 바 수정: BACK 추가, OUT/IN 숨김, SHARE → LINK
        var tools = document.getElementById('editor-tools');
        if (tools) {
            // BACK 버튼 추가
            var backBtn = document.createElement('button');
            backBtn.className = 'text-btn';
            backBtn.textContent = 'BACK';
            backBtn.style.cssText = 'color: var(--color-3);';
            backBtn.onclick = function() { window.location.href = 'dashboard.html'; };
            tools.insertBefore(backBtn, tools.firstChild);
            var sep = document.createElement('span');
            sep.className = 'tool-sep'; sep.textContent = '|';
            tools.insertBefore(sep, backBtn.nextSibling);

            // OUT/IN 숨기기, SHARE → LINK
            var dataCtrl = tools.querySelector('.data-controls');
            if (dataCtrl) dataCtrl.style.display = 'none';
            // 이전 separator도 숨기기
            if (dataCtrl && dataCtrl.previousElementSibling && dataCtrl.previousElementSibling.classList.contains('tool-sep')) {
                dataCtrl.previousElementSibling.style.display = 'none';
            }

            tools.querySelectorAll('.text-btn').forEach(function(b) {
                if (b.textContent.trim() === 'SHARE') b.textContent = 'LINK';
            });
        }
    });
})();
