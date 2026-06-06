/**
 * ====================================================================
 * 위치비교기 (Place Comparer) - Core Logic Script (Vanilla JS ES6+)
 * ====================================================================
 */

// 1. 애플리케이션 상태 관리 객체 (State)
const state = {
    places: [],          // 추가된 장소 배열 (최대 10개) {id, name, lat, lng, marker, infowindow}
    map: null,           // 카카오 지도 객체 인스턴스
    polyline: null,      // 장소들을 이어주는 연결선 객체
    geocoder: null,      // 장소 검색용 카카오 로컬 서비스 주소-좌표 변환 객체
    maxPlaces: 10        // 최대 허용 개수 스펙
};

// 2. 초기 맵 셋업 (대한민국 전역이 보이도록 기본 좌표 명세화)
const DEFAULT_MAP_CENTER = { lat: 36.2683, lng: 127.6358 };
const DEFAULT_MAP_LEVEL = 12;

// 3. 돔 요소 캐싱
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const placeList = document.getElementById('place-list');
const distanceCard = document.getElementById('distance-card');
const distanceTableBody = document.getElementById('distance-table-body');
const globalCounter = document.getElementById('global-counter');
const listCounter = document.getElementById('list-counter');
const clearAllBtn = document.getElementById('clear-all-btn');

// 4. 애플리케이션 진입점 (DOM Load 시 실행)
window.addEventListener('DOMContentLoaded', () => {
    initKakaoMap();
    initEventListeners();
});

/**
 * 카카오 지도 및 서비스 인스턴스 초기화 함수
 */
function initKakaoMap() {
    if (typeof kakao !== 'undefined' && kakao.maps) {
        const mapContainer = document.getElementById('map');
        const mapOption = {
            center: new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
            level: DEFAULT_MAP_LEVEL
        };

        // 지도 생성
        state.map = new kakao.maps.Map(mapContainer, mapOption);
        
        // 주소-좌표 변환을 위한 로컬 Geocoder 서비스 객체 생성
        state.geocoder = new kakao.maps.services.Geocoder();

        // 폴리라인(연결선) 기본 옵션 레이아웃 설정
        state.polyline = new kakao.maps.Polyline({
            map: state.map,
            path: [],
            strokeWeight: 4,
            strokeColor: '#8b5cf6', // 퍼플 아이덴티티 네온 컬러
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });
    } else {
        alert("카카오 맵 SDK를 불러오지 못했습니다. HTML 파일 하단에 올바른 API AppKey를 입력했는지 확인하세요.");
    }
}

/**
 * 글로벌 이벤트 리스너 등록
 */
function initEventListeners() {
    // 검색 폼 서브밋 이벤트 리스너
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = searchInput.value.trim();
        if (!keyword) return;

        if (state.places.length >= state.maxPlaces) {
            alert("최대 10개 장소까지만 추가할 수 있습니다.");
            searchInput.value = '';
            return;
        }

        searchAndAddPlace(keyword);
    });

    // 전체 삭제 버튼 이벤트 리스너
    clearAllBtn.addEventListener('click', () => {
        clearAllPlaces();
    });
}

/**
 * Kakao Local API 활용 장소 검색 및 앱 적재 프로세스
 * @param {string} keyword 
 */
function searchAndAddPlace(keyword) {
    setLoading(true);

    // 카카오 로컬 키워드/주소 검색 서비스 호출 (불필요한 외부 API 호출 최소화를 위해 내장 서비스 활용)
    state.geocoder.addressSearch(keyword, (result, status) => {
        if (status === kakao.maps.services.Status.OK) {
            const data = result[0];
            const name = data.buildingName || data.address_name || keyword;
            const lat = parseFloat(data.y);
            const lng = parseFloat(data.x);

            addNewPlaceItem(name, lat, lng);
            setLoading(false);
            searchInput.value = '';
        } else {
            // 주소 검색 실패 시 키워드 플레이스 검색 2차 시도 인터페이스 전개
            const ps = new kakao.maps.services.Places();
            ps.keywordSearch(keyword, (placeResult, placeStatus) => {
                setLoading(false);
                if (placeStatus === kakao.maps.services.Status.OK) {
                    const data = placeResult[0];
                    addNewPlaceItem(data.place_name, parseFloat(data.y), parseFloat(data.x));
                    searchInput.value = '';
                } else {
                    alert("장소를 찾을 수 없습니다.");
                }
            });
        }
    });
}

/**
 * 새 장소 데이터 바인딩 및 지도 마커 맵핑 함수
 */
function addNewPlaceItem(name, lat, lng) {
    const id = Date.now().toString();
    const position = new kakao.maps.LatLng(lat, lng);

    // 1. 마커 생성
    const marker = new kakao.maps.Marker({
        position: position,
        map: state.map
    });

    // 2. 인포윈도우 설정 명세
    const content = `
        <div class="custom-infowindow">
            <strong style="color:#8b5cf6; display:block; margin-bottom:4px;">${name}</strong>
            <span style="display:block; color:#666; font-size:11px;">위도: ${lat.toFixed(4)}</span>
            <span style="display:block; color:#666; font-size:11px;">경도: ${lng.toFixed(4)}</span>
        </div>
    `;
    const infowindow = new kakao.maps.InfoWindow({
        content: content,
        removable: true
    });

    // 마커 클릭 이벤트 핸들러 바인딩
    kakao.maps.event.addListener(marker, 'click', () => {
        infowindow.open(state.map, marker);
    });

    // 3. 상태 관리 배열에 적재
    state.places.push({ id, name, lat, lng, marker, infowindow });

    // UI 동기화 및 줌 레벨 오토 스케일링 작동
    updateUI();
    recalculateMapBounds();
}

/**
 * 특정 장소 아웃바운드 딜리트 함수
 * @param {string} id 
 */
function deletePlace(id) {
    const targetIndex = state.places.findIndex(p => p.id === id);
    if (targetIndex === -1) return;

    const target = state.places[targetIndex];
    
    // 지도 객체 리소스 해제 제거
    target.marker.setMap(null);
    target.infowindow.close();

    // 배열 제외 제거
    state.places.splice(targetIndex, 1);

    updateUI();
    recalculateMapBounds();
}

/**
 * 모든 데이터 초기화 (전체 삭제 스펙)
 */
function clearAllPlaces() {
    state.places.forEach(p => {
        p.marker.setMap(null);
        p.infowindow.close();
    });
    state.places = [];

    updateUI();
    
    // 초기 맵 스테이지 복귀 설정
    state.map.setCenter(new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng));
    state.map.setLevel(DEFAULT_MAP_LEVEL);
}

/**
 * 모든 마커 수용 가능한 자동 줌 (fitBounds) 동적 계산식
 */
function recalculateMapBounds() {
    if (state.places.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();
    state.places.forEach(p => {
        bounds.extend(new kakao.maps.LatLng(p.lat, p.lng));
    });

    state.map.fitBounds(bounds);
}

/**
 * Haversine 공식을 이용한 두 위경도 간 대권 직선거리 계산 공식 함수
 */
function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 지구 평균 반지름 (km 단위)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // km 단위 반환
}

/**
 * 로딩 인디케이터 제어 함수
 */
function setLoading(isLoading) {
    if (isLoading) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
}

/**
 * 데이터 변경에 대응하는 통합 UI 렌더링 갱신 엔진
 */
function updateUI() {
    const count = state.places.length;

    // 카운터 텍스트 업데이트 동기화
    globalCounter.textContent = `현재 ${count} / 10개 장소`;
    listCounter.textContent = `${count}/10`;

    // 1. 장소 리스트 뷰 처리
    if (count === 0) {
        emptyState.classList.remove('hidden');
        placeList.classList.add('hidden');
        placeList.innerHTML = '';
    } else {
        emptyState.classList.add('hidden');
        placeList.classList.remove('hidden');
        
        placeList.innerHTML = state.places.map((place, index) => `
            <li class="bg-white/60 px-4 py-3 rounded-xl border border-gray-100 flex items-center justify-between gap-3 shadow-sm hover:bg-white/90 transition-all animate-scale-in">
                <div class="flex items-center space-x-2.5 overflow-hidden">
                    <span class="w-5 h-5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">${index + 1}</span>
                    <span class="text-sm font-semibold text-gray-700 truncate">${place.name}</span>
                </div>
                <button onclick="deletePlace('${place.id}')" class="text-xs font-bold text-red-400 hover:text-red-600 transition-colors p-1 flex-shrink-0">삭제</button>
            </li>
        `).join('');
    }

    // 2. 지도 연결선 (Polyline) 갱신 연동
    if (count >= 1) {
        const linePath = state.places.map(p => new kakao.maps.LatLng(p.lat, p.lng));
        state.polyline.setPath(linePath);
        state.polyline.setMap(state.map);
    } else {
        state.polyline.setPath([]);
    }

    // 3. 거리 테이블 계산 조합 제어 파트 (2개 이상일 경우 작동)
    if (count >= 2) {
        distanceCard.classList.remove('hidden');
        let tableRowsHtml = '';

        // 모든 순서쌍 조합 산출 루프 (Combination)
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const p1 = state.places[i];
                const p2 = state.places[j];
                const distance = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);

                tableRowsHtml += `
                    <tr class="hover:bg-purple-50/40 transition-colors">
                        <td class="py-3 pr-2">
                            <div class="flex items-center gap-1">
                                <span class="font-bold text-gray-800 truncate max-w-[100px] sm:max-w-none">${p1.name}</span>
                                <span class="text-purple-400 text-xs">↔</span>
                                <span class="font-bold text-gray-800 truncate max-w-[100px] sm:max-w-none">${p2.name}</span>
                            </div>
                        </td>
                        <td class="py-3 text-xs text-gray-400 font-mono hidden sm:table-cell">
                            (${p1.lat.toFixed(2)}, ${p1.lng.toFixed(2)}) ↔ (${p2.lat.toFixed(2)}, ${p2.lng.toFixed(2)})
                        </td>
                        <td class="py-3 text-right font-mono font-black text-purple-600 text-sm">
                            ${distance.toFixed(1)} km
                        </td>
                    </tr>
                `;
            }
        }
        distanceTableBody.innerHTML = tableRowsHtml;
    } else {
        distanceCard.classList.add('hidden');
        distanceTableBody.innerHTML = '';
    }
}

// 글로벌 스코프 할당 (인라인 onclick 바인딩 대응)
window.deletePlace = deletePlace;