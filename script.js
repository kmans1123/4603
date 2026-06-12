/**
 * ====================================================================
 * 위치비교기 (Place Comparer) - 통합 검색, 순서 변경, 거리 토글 고도화 스크립트
 * ====================================================================
 */

const state = {
    places: [],          
    map: null,           
    polyline: null,      
    placesService: null, // 카카오 장소(키워드) 검색 서비스 객체
    geocoderService: null, // 카카오 주소-좌표 변환 서비스 객체
    maxPlaces: 10,
    showDistance: true   // [추가] 직선거리 화면 노출 여부 상태값
};

const DEFAULT_MAP_CENTER = { lat: 36.2683, lng: 127.6358 };
const DEFAULT_MAP_LEVEL = 12;

// DOM 요소 캐싱
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const dropdown = document.getElementById('search-results-dropdown');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const placeList = document.getElementById('place-list');
const distanceCard = document.getElementById('distance-card');
const distanceTableBody = document.getElementById('distance-table-body');
const globalCounter = document.getElementById('global-counter');
const listCounter = document.getElementById('list-counter');
const clearAllBtn = document.getElementById('clear-all-btn');

window.addEventListener('DOMContentLoaded', () => {
    initKakaoMap();
    initEventListeners();
});

function initKakaoMap() {
    if (typeof kakao !== 'undefined' && kakao.maps) {
        const mapContainer = document.getElementById('map');
        const mapOption = {
            center: new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng),
            level: DEFAULT_MAP_LEVEL
        };

        state.map = new kakao.maps.Map(mapContainer, mapOption);
        
        // 두 가지 검색 서비스 객체 초기화 및 바인딩
        state.placesService = new kakao.maps.services.Places();
        state.geocoderService = new kakao.maps.services.Geocoder();

        state.polyline = new kakao.maps.Polyline({
            map: state.map,
            path: [],
            strokeWeight: 4,
            strokeColor: '#8b5cf6',
            strokeOpacity: 0.8,
            strokeStyle: 'solid'
        });
    } else {
        alert("SDK 로드 에러");
    }
}

function initEventListeners() {
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = searchInput.value.trim();
        if (!keyword) return;

        if (state.places.length >= state.maxPlaces) {
            alert("최대 10개 장소까지만 추가할 수 있습니다.");
            searchInput.value = '';
            return;
        }

        searchIntegratedCandidates(keyword);
    });

    // 드롭다운 외부 영역 클릭 시 검색 후보 리스트 닫기 처리
    document.addEventListener('click', (e) => {
        if (!searchForm.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    clearAllBtn.addEventListener('click', () => {
        clearAllPlaces();
    });
}

/**
 * [최종 보완] 키워드와 주소 결과를 안전하게 결합하는 통합 검색 함수
 */
function searchIntegratedCandidates(keyword) {
    setLoading(true);
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');

    let candidates = [];
    let isKeywordFinished = false;
    let isGeocoderFinished = false;

    // 두 API의 요청이 모두 끝났을 때 단 한번만 호출되는 헬퍼 함수
    const mergeAndRender = () => {
        if (!isKeywordFinished || !isGeocoderFinished) return;
        setLoading(false);

        if (candidates.length === 0) {
            alert("장소를 찾을 수 없습니다.");
            return;
        }

        dropdown.classList.remove('hidden');
        
        candidates.slice(0, 10).forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = "w-full text-left px-4 py-3 hover:bg-purple-50 text-sm transition-colors flex flex-col gap-0.5 border-b border-gray-50 focus:outline-none";
            
            btn.innerHTML = `
                <span class="font-bold text-gray-800">${item.title}</span>
                <span class="text-xs text-gray-400">${item.address}</span>
            `;

            // 후보군 클릭 시 상세 주소(item.address)도 함께 파라미터로 바인딩
            btn.addEventListener('click', () => {
                addNewPlaceItem(item.title, item.address, item.lat, item.lng);
                dropdown.classList.add('hidden');
                searchInput.value = '';
            });

            dropdown.appendChild(btn);
        });
    };

    // 1. 키워드(장소명) 검색 구동
    state.placesService.keywordSearch(keyword, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result) {
            result.forEach(p => {
                candidates.push({
                    title: p.place_name,
                    address: p.road_address_name || p.address_name,
                    lat: parseFloat(p.y),
                    lng: parseFloat(p.x)
                });
            });
        }
        isKeywordFinished = true;
        mergeAndRender();
    });

    // 2. 주소(순수 지번/도로명) 검색 구동
    state.geocoderService.addressSearch(keyword, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result) {
            result.forEach(addr => {
                candidates.push({
                    title: addr.address_name, 
                    address: addr.road_address ? addr.road_address.address_name : addr.address.address_name,
                    lat: parseFloat(addr.y),
                    lng: parseFloat(addr.x)
                });
            });
        }
        isGeocoderFinished = true;
        mergeAndRender();
    });
}

/**
 * 선택된 장소 최종 적재 및 마커 세팅
 */
function addNewPlaceItem(name, address, lat, lng) {
    const id = Date.now().toString();
    const position = new kakao.maps.LatLng(lat, lng);

    const marker = new kakao.maps.Marker({
        position: position,
        map: state.map
    });

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

    kakao.maps.event.addListener(marker, 'click', () => {
        infowindow.open(state.map, marker);
    });

    // state 구조에 모바일 상세 조회를 위한 address 데이터도 함께 세팅
    state.places.push({ id, name, address, lat, lng, marker, infowindow });

    updateUI();
    recalculateMapBounds();
}

/**
 * [개선] 개별 장소 삭제 함수
 */
function deletePlace(id) {
    const targetIndex = state.places.findIndex(p => p.id === id);
    if (targetIndex === -1) return;

    const target = state.places[targetIndex];
    target.marker.setMap(null);
    target.infowindow.close();

    state.places.splice(targetIndex, 1);

    updateUI();
    recalculateMapBounds();
}

/**
 * [추가] 장소 순서를 위로 이동시키는 함수
 */
function moveUp(index) {
    if (index <= 0) return; 
    
    const temp = state.places[index];
    state.places[index] = state.places[index - 1];
    state.places[index - 1] = temp;

    updateUI();
}

/**
 * [추가] 장소 순서를 아래로 이동시키는 함수
 */
function moveDown(index) {
    if (index >= state.places.length - 1) return; 
    
    const temp = state.places[index];
    state.places[index] = state.places[index + 1];
    state.places[index + 1] = temp;

    updateUI();
}

function clearAllPlaces() {
    state.places.forEach(p => {
        p.marker.setMap(null);
        p.infowindow.close();
    });
    state.places = [];
    updateUI();
    state.map.setCenter(new kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng));
    state.map.setLevel(DEFAULT_MAP_LEVEL);
}

function recalculateMapBounds() {
    if (state.places.length === 0) return;
    const bounds = new kakao.maps.LatLngBounds();
    state.places.forEach(p => {
        bounds.extend(new kakao.maps.LatLng(p.lat, p.lng));
    });
    state.map.fitBounds(bounds);
}

function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function setLoading(isLoading) {
    if (isLoading) loadingSpinner.classList.remove('hidden');
    else loadingSpinner.classList.add('hidden');
}

/**
 * [고도화] 데이터 바인딩 기반 인터랙티브 UI 렌더러
 */
function updateUI() {
    const count = state.places.length;
    globalCounter.textContent = `현재 ${count} / 10개 장소`;
    listCounter.textContent = `${count}/10`;

    if (count === 0) {
        emptyState.classList.remove('hidden');
        placeList.classList.add('hidden');
        placeList.innerHTML = '';
    } else {
        emptyState.classList.add('hidden');
        placeList.classList.remove('hidden');
        
        // 기존 innerHTML 바인딩 초기화
        placeList.innerHTML = '';

        // DOM 객체를 동적으로 한 땀 한 땀 생성하여 정교하게 이벤트 매칭
        state.places.forEach((place, index) => {
            const li = document.createElement('li');
            li.className = "bg-white/60 px-4 py-3 rounded-xl border border-gray-100 flex items-center justify-between gap-3 shadow-sm hover:bg-white/90 transition-all animate-scale-in";

            // 순서 표기 및 장소명 구역 (모바일 2단 분리 및 줄바꿈 차단 해제 완벽 적용)
            const infoDiv = document.createElement('div');
            infoDiv.className = "flex items-center space-x-2.5 overflow-hidden flex-1";
            infoDiv.innerHTML = `
                <span class="w-5 h-5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">${index + 1}</span>
                <div class="flex flex-col min-w-0 flex-1 gap-0.5">
                    <span class="text-sm font-bold text-gray-800 break-all leading-tight">
                        ${place.name}
                    </span>
                    <span class="text-xs text-gray-400 break-all leading-normal">
                        ${place.address || ''}
                    </span>
                </div>
            `;
            li.appendChild(infoDiv);

            // 정렬 및 관리를 제어할 액션 버튼 구역
            const actionDiv = document.createElement('div');
            actionDiv.className = "flex items-center space-x-2 flex-shrink-0";

            // 위로 이동 버튼
            const upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = `text-xs p-1 font-bold ${index === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-purple-400 hover:text-purple-600'} transition-colors`;
            upBtn.innerText = "▲";
            if (index > 0) {
                upBtn.addEventListener('click', () => moveUp(index));
            }
            actionDiv.appendChild(upBtn);

            // 아래로 이동 버튼
            const downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = `text-xs p-1 font-bold ${index === count - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-purple-400 hover:text-purple-600'} transition-colors`;
            downBtn.innerText = "▼";
            if (index < count - 1) {
                downBtn.addEventListener('click', () => moveDown(index));
            }
            actionDiv.appendChild(downBtn);

            // 개별 삭제 버튼
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = "text-xs font-bold text-red-400 hover:text-red-600 transition-colors p-1";
            delBtn.innerText = "삭제";
            delBtn.addEventListener('click', () => deletePlace(place.id));
            actionDiv.appendChild(delBtn);

            li.appendChild(actionDiv);
            placeList.appendChild(li);
        });
    }

    // 선 경로 갱신
    if (count >= 1) {
        const linePath = state.places.map(p => new kakao.maps.LatLng(p.lat, p.lng));
        state.polyline.setPath(linePath);
        state.polyline.setMap(state.map);
    } else {
        state.polyline.setPath([]);
    }

    // [고도화 반영] 직선거리 카드 표출 제어 및 온오프 토글 스위치 탑재 구역
    if (count >= 2) {
        distanceCard.classList.remove('hidden');
        
        // 카드 내 헤더 타이틀을 추출하여 우측 영역에 토글 버튼 바인딩
        const cardHeader = distanceCard.querySelector('h2');
        if (cardHeader) {
            // 중복 생성 컴포넌트 방지용 초기화
            const oldBtn = cardHeader.querySelector('.toggle-distance-btn');
            if (oldBtn) oldBtn.remove();

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            // 디자인에 이질감이 없도록 연한 보라색 배경에 둥근 라운드 버튼 적용
            toggleBtn.className = "toggle-distance-btn ml-auto bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer focus:outline-none";
            toggleBtn.innerText = state.showDistance ? "👁️ 거리 숨기기" : "👁️‍🗨️ 거리 보기";
            
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.showDistance = !state.showDistance; // 상태 플래그 반전
                updateUI(); // 재렌더링하여 하단 테이블 구역 가시성 조절
            });
            cardHeader.appendChild(toggleBtn);
        }

        const tableContainer = distanceCard.querySelector('.overflow-x-auto');

        // 상태값(state.showDistance) 온오프에 따라 테이블 컨테이너 영역 노출 제어
        if (!state.showDistance) {
            tableContainer.classList.add('hidden'); // 접기(숨기기)
        } else {
            tableContainer.classList.remove('hidden'); // 펼치기(보기)

            let tableRowsHtml = '';
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
        }
    } else {
        distanceCard.classList.add('hidden');
        distanceTableBody.innerHTML = '';
    }
}
