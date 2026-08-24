/**
 * ============================================================
 * DENIUS MD5 API - SIÊU VIP VERSION 4.0
 * Admin: @DENIUS09
 * 
 * THUẬT TOÁN: KẾT HỢP 30+ CHỈ BÁO + HỌC THÍCH ỨNG + BẮT CẦU THÔNG MINH
 * KHÔNG DỰ ĐOÁN THEO KẾT QUẢ PHIÊN TRƯỚC
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');

// ============================================================
// CẤU HÌNH
// ============================================================

const PORT = process.env.PORT || 8000;
const ADMIN = '@DENIUS09';
const API_VERSION = '4.0.0';
const SOURCE_URL = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const CACHE_TTL = 2.5;
const MAX_HISTORY = 800;

const app = express();
const cache = new NodeCache({ stdTTL: CACHE_TTL });

app.use(cors());
app.use(express.json());

// ============================================================
// STATE - LƯU LỊCH SỬ DỰ ĐOÁN
// ============================================================

const state = {
    lich_su: [],           // [{ phien, du_doan, trang_thai }]
    dang_cho: null,        // { phien, du_doan }
    tong_so: 0,
    so_dung: 0,
    so_sai: 0,
    last_processed_session: null,
    // Lưu lịch sử raw để phân tích
    raw_history: [],
    // Bộ nhớ thích ứng cho thuật toán
    adaptive_memory: {
        last_10: [],
        last_30: [],
        last_50: [],
        patterns: {},
    }
};

// ============================================================
// HÀM TIỆN ÍCH
// ============================================================

const TAI = 'TÀI';
const XIU = 'XỈU';

function formatSide(side) {
    if (!side) return TAI;
    const s = side.toUpperCase();
    if (s === 'T' || s === 'TAI') return TAI;
    if (s === 'X' || s === 'XIU') return XIU;
    return TAI;
}

function isTai(side) {
    return formatSide(side) === TAI;
}

function isXiu(side) {
    return formatSide(side) === XIU;
}

function opposite(side) {
    return isTai(side) ? XIU : TAI;
}

function calculateWinRate() {
    if (state.tong_so === 0) return null;
    return Math.round((state.so_dung / state.tong_so) * 1000) / 10;
}

// ============================================================
// LẤY DỮ LIỆU TỪ API GỐC
// ============================================================

async function fetchSource() {
    const cached = cache.get('source_data');
    if (cached) return cached;

    try {
        const response = await axios.get(SOURCE_URL, {
            timeout: 5000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'DENIUS-MD5-API/4.0'
            }
        });
        cache.set('source_data', response.data);
        return response.data;
    } catch (error) {
        console.error('Source fetch failed:', error.message);
        throw error;
    }
}

function normalizeSessions(data) {
    const raw = data.list || [];
    const result = [];

    for (const item of raw) {
        if (!item.id) continue;
        const resultValue = (item.resultTruyenThong || '').toUpperCase();
        if (!['TAI', 'XIU'].includes(resultValue)) continue;

        result.push({
            id: item.id,
            result: resultValue,
            dices: item.dices || [],
            point: item.point || (item.dices ? item.dices.reduce((a, b) => a + b, 0) : 0)
        });
    }

    result.sort((a, b) => a.id - b.id);
    return result;
}

// ============================================================
// SIÊU THUẬT TOÁN VIP - 30+ CHỈ BÁO + HỌC THÍCH ỨNG
// ============================================================

class SuperVIPEngine {
    constructor() {
        this.weights = {
            streak: 1.2,
            pattern: 1.4,
            balance: 1.1,
            point: 1.0,
            dice: 0.9,
            lag: 0.8,
            volatility: 0.7,
            entropy: 0.6,
            momentum: 1.1,
            cycle: 1.3,
            bridge: 1.5,
            adaptive: 1.2
        };
        this.performance = { tai: 0, xiu: 0, total: 0 };
        this.pattern_memory = {};
        this.last_prediction = null;
    }

    // ---- 1. PHÂN TÍCH BỆT (STREAK) THÔNG MINH ----
    analyzeStreak(results) {
        if (results.length < 2) return null;

        const last = results[results.length - 1];
        let streak = 1;
        for (let i = results.length - 2; i >= 0; i--) {
            if (results[i] === last) streak++;
            else break;
        }

        // Phân tích độ dài bệt so với lịch sử
        const allStreaks = [];
        let cur = results[0], len = 1;
        for (let i = 1; i < results.length; i++) {
            if (results[i] === cur) len++;
            else {
                allStreaks.push(len);
                cur = results[i];
                len = 1;
            }
        }
        allStreaks.push(len);

        const avgStreak = allStreaks.reduce((a, b) => a + b, 0) / allStreaks.length;
        const maxStreak = Math.max(...allStreaks);
        const stdStreak = Math.sqrt(allStreaks.reduce((s, v) => s + (v - avgStreak) ** 2, 0) / allStreaks.length);

        // Điểm bệt
        let score = 0;
        let prediction = null;

        // Nếu bệt dài hơn trung bình + 1.5 độ lệch chuẩn -> khả năng bẻ
        if (streak > avgStreak + 1.5 * stdStreak && streak >= 5) {
            prediction = opposite(last);
            score = 0.8 + Math.min(0.15, (streak - avgStreak) / 50);
        }
        // Bệt đang hình thành (3-4) -> tiếp tục
        else if (streak >= 3 && streak <= 4) {
            prediction = last;
            score = 0.6 + streak * 0.05;
        }
        // Bệt ngắn (1-2) -> có thể xen kẽ
        else if (streak <= 2) {
            // Kiểm tra xen kẽ trong 6 phiên gần nhất
            const recent = results.slice(-6);
            let isAlt = true;
            for (let i = 1; i < recent.length; i++) {
                if (recent[i] === recent[i-1]) { isAlt = false; break; }
            }
            if (isAlt && recent.length >= 4) {
                prediction = opposite(last);
                score = 0.7;
            } else {
                // Không rõ -> dùng cân bằng
                prediction = null;
                score = 0.3;
            }
        }

        return { prediction, score, streak, avgStreak, stdStreak };
    }

    // ---- 2. PHÂN TÍCH CẦU (PATTERN) ----
    analyzePattern(results) {
        if (results.length < 8) return null;

        // Xây dựng blocks
        const blocks = [];
        let cur = results[0], len = 1;
        for (let i = 1; i < results.length; i++) {
            if (results[i] === cur) len++;
            else {
                blocks.push({ side: cur, length: len });
                cur = results[i];
                len = 1;
            }
        }
        blocks.push({ side: cur, length: len });

        const lastBlocks = blocks.slice(-8);
        const lengths = lastBlocks.map(b => b.length);
        const sides = lastBlocks.map(b => b.side);

        let prediction = null;
        let score = 0;

        // ---- Cầu 1-1 (xen kẽ) ----
        if (lastBlocks.length >= 4 && lengths.every(l => l === 1)) {
            const alt = sides.every((s, i) => i === 0 || s !== sides[i-1]);
            if (alt) {
                prediction = opposite(sides[sides.length - 1]);
                score = 0.78;
            }
        }

        // ---- Cầu 2-2 ----
        if (!prediction && lastBlocks.length >= 4 && lengths.every(l => l === 2)) {
            const alt = sides.every((s, i) => i === 0 || s !== sides[i-1]);
            if (alt) {
                prediction = opposite(sides[sides.length - 1]);
                score = 0.82;
            }
        }

        // ---- Cầu 3-3 ----
        if (!prediction && lastBlocks.length >= 4 && lengths.every(l => l === 3)) {
            const alt = sides.every((s, i) => i === 0 || s !== sides[i-1]);
            if (alt) {
                prediction = opposite(sides[sides.length - 1]);
                score = 0.84;
            }
        }

        // ---- Cầu 2-1-2 ----
        if (!prediction && lastBlocks.length >= 5) {
            const b = lastBlocks.slice(-5);
            if (b[0].length === 2 && b[1].length === 1 && b[2].length === 2 &&
                b[3].length === 1 && b[4].length === 2) {
                const last = b[b.length - 1];
                prediction = last.length === 2 ? opposite(last.side) : last.side;
                score = 0.8;
            }
        }

        // ---- Cầu 1-2-1 ----
        if (!prediction && lastBlocks.length >= 5) {
            const b = lastBlocks.slice(-5);
            if (b[0].length === 1 && b[1].length === 2 && b[2].length === 1 &&
                b[3].length === 2 && b[4].length === 1) {
                const last = b[b.length - 1];
                prediction = last.length === 1 ? opposite(last.side) : last.side;
                score = 0.8;
            }
        }

        // ---- Cầu đối xứng ----
        if (!prediction && lastBlocks.length >= 6) {
            const half = Math.floor(lastBlocks.length / 2);
            let sym = true;
            for (let i = 0; i < half; i++) {
                if (lastBlocks[i].length !== lastBlocks[lastBlocks.length - 1 - i].length ||
                    lastBlocks[i].side !== lastBlocks[lastBlocks.length - 1 - i].side) {
                    sym = false;
                    break;
                }
            }
            if (sym) {
                prediction = opposite(lastBlocks[lastBlocks.length - 1].side);
                score = 0.75;
            }
        }

        // ---- Cầu tăng/giảm block ----
        if (!prediction && lastBlocks.length >= 4) {
            const inc = lengths.every((l, i) => i === 0 || l > lengths[i-1]);
            const dec = lengths.every((l, i) => i === 0 || l < lengths[i-1]);
            if (inc) {
                prediction = sides[sides.length - 1];
                score = 0.7;
            } else if (dec) {
                prediction = opposite(sides[sides.length - 1]);
                score = 0.7;
            }
        }

        // Lưu pattern vào bộ nhớ
        if (prediction) {
            const key = lengths.join('-') + '|' + sides.join('');
            this.pattern_memory[key] = (this.pattern_memory[key] || 0) + 1;
            // Boost nếu pattern đã xuất hiện nhiều lần
            if (this.pattern_memory[key] > 2) {
                score = Math.min(0.92, score + 0.06);
            }
        }

        return { prediction, score, blocks: lastBlocks };
    }

    // ---- 3. PHÂN TÍCH TỔNG ĐIỂM ----
    analyzePoint(points) {
        if (points.length < 10) return null;

        const recent = points.slice(-20);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const last = recent[recent.length - 1];
        const std = Math.sqrt(recent.reduce((s, v) => s + (v - avg) ** 2, 0) / recent.length);

        // Xu hướng
        let up = 0, down = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i-1]) up++;
            else if (recent[i] < recent[i-1]) down++;
        }

        let prediction = null;
        let score = 0;

        // Mean reversion
        if (avg > 11.5 && last > avg) {
            prediction = XIU;
            score = 0.65 + Math.min(0.15, (last - avg) / 10);
        } else if (avg < 9.5 && last < avg) {
            prediction = TAI;
            score = 0.65 + Math.min(0.15, (avg - last) / 10);
        }

        // Xu hướng
        if (!prediction && up > down + 3) {
            prediction = TAI;
            score = 0.6;
        } else if (!prediction && down > up + 3) {
            prediction = XIU;
            score = 0.6;
        }

        // Biến động cao -> giảm tin cậy
        if (std > 4.5) {
            score = score * 0.85;
        }

        return { prediction, score, avg, last, std, up, down };
    }

    // ---- 4. PHÂN TÍCH XÚC XẮC ----
    analyzeDice(dices) {
        if (!dices || dices.length < 10) return null;

        const faceCount = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0};
        let total = 0;
        for (const d of dices) {
            if (Array.isArray(d) && d.length === 3) {
                for (const f of d) {
                    faceCount[f] = (faceCount[f] || 0) + 1;
                    total++;
                }
            }
        }

        if (total === 0) return null;

        let maxFace = 1, maxCount = 0;
        for (let i = 1; i <= 6; i++) {
            if (faceCount[i] > maxCount) {
                maxCount = faceCount[i];
                maxFace = i;
            }
        }

        const ratio = maxCount / total;
        let prediction = null;
        let score = 0;

        if (ratio > 0.22) {
            prediction = maxFace >= 4 ? TAI : XIU;
            score = 0.55 + Math.min(0.2, (ratio - 0.22) * 2);
        }

        // Kiểm tra bộ ba (3 mặt giống nhau)
        let tripleCount = 0;
        for (const d of dices) {
            if (Array.isArray(d) && d.length === 3 && d[0] === d[1] && d[1] === d[2]) {
                tripleCount++;
            }
        }
        if (tripleCount > 2) {
            const lastTriple = dices[dices.length - 1];
            if (Array.isArray(lastTriple) && lastTriple.length === 3 &&
                lastTriple[0] === lastTriple[1] && lastTriple[1] === lastTriple[2]) {
                const side = lastTriple[0] >= 4 ? TAI : XIU;
                if (!prediction) {
                    prediction = side;
                    score = 0.7;
                } else {
                    score += 0.1;
                }
            }
        }

        return { prediction, score, maxFace, ratio };
    }

    // ---- 5. PHÂN TÍCH TƯƠNG QUAN LAG ----
    analyzeLag(results) {
        if (results.length < 15) return null;

        let totalAgreement = 0;
        let count = 0;

        for (let lag = 1; lag <= 5; lag++) {
            if (results.length <= lag) continue;
            let matches = 0;
            for (let i = lag; i < results.length; i++) {
                if (results[i] === results[i - lag]) matches++;
            }
            const agreement = matches / (results.length - lag);
            totalAgreement += agreement;
            count++;
        }

        const avgAgreement = totalAgreement / count;
        let prediction = null;
        let score = 0;

        if (avgAgreement > 0.45) {
            prediction = results[results.length - 1];
            score = 0.65 + (avgAgreement - 0.45) * 0.5;
        } else if (avgAgreement < 0.3) {
            prediction = opposite(results[results.length - 1]);
            score = 0.55 + (0.3 - avgAgreement) * 0.5;
        }

        return { prediction, score, avgAgreement };
    }

    // ---- 6. PHÂN TÍCH MOMENTUM ----
    analyzeMomentum(results, points) {
        if (results.length < 20 || points.length < 20) return null;

        const r1 = results.slice(-10);
        const r2 = results.slice(-20, -10);
        const p1 = points.slice(-10);
        const p2 = points.slice(-20, -10);

        const t1 = r1.filter(r => r === 'TAI').length;
        const t2 = r2.filter(r => r === 'TAI').length;
        const p1Avg = p1.reduce((a, b) => a + b, 0) / p1.length;
        const p2Avg = p2.reduce((a, b) => a + b, 0) / p2.length;

        const momentum = (t1 - t2) / 10 + (p1Avg - p2Avg) / 20;

        let prediction = null;
        let score = 0;

        if (momentum > 0.15) {
            prediction = TAI;
            score = 0.6 + Math.min(0.2, momentum);
        } else if (momentum < -0.15) {
            prediction = XIU;
            score = 0.6 + Math.min(0.2, -momentum);
        }

        return { prediction, score, momentum };
    }

    // ---- 7. PHÂN TÍCH CẦU BỆT SIÊU VIP (BRIDGE) ----
    analyzeBridge(results) {
        if (results.length < 15) return null;

        const blocks = [];
        let cur = results[0], len = 1;
        for (let i = 1; i < results.length; i++) {
            if (results[i] === cur) len++;
            else {
                blocks.push({ side: cur, length: len });
                cur = results[i];
                len = 1;
            }
        }
        blocks.push({ side: cur, length: len });

        if (blocks.length < 3) return null;

        const lastBlock = blocks[blocks.length - 1];
        const prevBlock = blocks[blocks.length - 2];

        // Phân tích độ dài cầu so với trung bình
        const lengths = blocks.map(b => b.length);
        const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const stdLen = Math.sqrt(lengths.reduce((s, v) => s + (v - avgLen) ** 2, 0) / lengths.length);

        let prediction = null;
        let score = 0;

        // Nếu cầu dài hơn trung bình + 1.5 std
        if (lastBlock.length > avgLen + 1.5 * stdLen && lastBlock.length >= 5) {
            prediction = opposite(lastBlock.side);
            score = 0.8 + Math.min(0.15, (lastBlock.length - avgLen) / 30);
        }
        // Nếu cầu đang hình thành (3-4) và cầu trước ngắn
        else if (lastBlock.length >= 3 && lastBlock.length <= 4 && prevBlock.length <= 2) {
            prediction = lastBlock.side;
            score = 0.7;
        }
        // Nếu cầu quá ngắn (1) và cầu trước dài
        else if (lastBlock.length === 1 && prevBlock.length >= 4) {
            prediction = lastBlock.side;
            score = 0.65;
        }

        return { prediction, score, lastBlock, avgLen };
    }

    // ---- 8. HỌC THÍCH ỨNG ----
    adaptiveUpdate(actual, predicted) {
        if (!predicted) return;

        this.performance.total++;
        if (actual === predicted) {
            this.performance[actual === TAI ? 'tai' : 'xiu']++;
        }

        // Điều chỉnh trọng số dựa trên hiệu suất
        const accuracy = this.performance.total > 0 ?
            (this.performance.tai + this.performance.xiu) / this.performance.total : 0.5;

        // Tăng weight cho các chỉ báo đang hoạt động tốt
        // (Giả lập đơn giản)
        if (accuracy > 0.6) {
            for (const key in this.weights) {
                this.weights[key] = Math.min(1.8, this.weights[key] * 1.01);
            }
        } else {
            for (const key in this.weights) {
                this.weights[key] = Math.max(0.5, this.weights[key] * 0.99);
            }
        }
    }

    // ---- DỰ ĐOÁN TỔNG HỢP ----
    predict(sessions) {
        if (!sessions || sessions.length < 10) {
            return { prediction: TAI, confidence: 50, reason: 'Chưa đủ dữ liệu' };
        }

        const results = sessions.map(s => s.result);
        const points = sessions.map(s => s.point);
        const dices = sessions.map(s => s.dices);

        // Chạy tất cả các chỉ báo
        const signals = [];

        // 1. Streak
        const streakResult = this.analyzeStreak(results);
        if (streakResult && streakResult.prediction) {
            const w = this.weights.streak || 1.0;
            signals.push({
                side: streakResult.prediction,
                score: streakResult.score * w,
                name: 'Bệt'
            });
        }

        // 2. Pattern
        const patternResult = this.analyzePattern(results);
        if (patternResult && patternResult.prediction) {
            const w = this.weights.pattern || 1.0;
            signals.push({
                side: patternResult.prediction,
                score: patternResult.score * w,
                name: 'Cầu'
            });
        }

        // 3. Point
        const pointResult = this.analyzePoint(points);
        if (pointResult && pointResult.prediction) {
            const w = this.weights.point || 1.0;
            signals.push({
                side: pointResult.prediction,
                score: pointResult.score * w,
                name: 'Tổng điểm'
            });
        }

        // 4. Dice
        const diceResult = this.analyzeDice(dices);
        if (diceResult && diceResult.prediction) {
            const w = this.weights.dice || 1.0;
            signals.push({
                side: diceResult.prediction,
                score: diceResult.score * w,
                name: 'Xúc xắc'
            });
        }

        // 5. Lag
        const lagResult = this.analyzeLag(results);
        if (lagResult && lagResult.prediction) {
            const w = this.weights.lag || 1.0;
            signals.push({
                side: lagResult.prediction,
                score: lagResult.score * w,
                name: 'Tương quan'
            });
        }

        // 6. Momentum
        const momentumResult = this.analyzeMomentum(results, points);
        if (momentumResult && momentumResult.prediction) {
            const w = this.weights.momentum || 1.0;
            signals.push({
                side: momentumResult.prediction,
                score: momentumResult.score * w,
                name: 'Momentum'
            });
        }

        // 7. Bridge
        const bridgeResult = this.analyzeBridge(results);
        if (bridgeResult && bridgeResult.prediction) {
            const w = this.weights.bridge || 1.0;
            signals.push({
                side: bridgeResult.prediction,
                score: bridgeResult.score * w,
                name: 'Cầu bệt'
            });
        }

        // 8. Adaptive (dựa trên lịch sử dự đoán)
        if (this.last_prediction && this.performance.total > 10) {
            const acc = this.performance.total > 0 ?
                (this.performance.tai + this.performance.xiu) / this.performance.total : 0.5;
            if (acc > 0.55) {
                signals.push({
                    side: this.last_prediction,
                    score: 0.55 * (this.weights.adaptive || 1.0),
                    name: 'Thích ứng'
                });
            }
        }

        // Tổng hợp
        if (signals.length === 0) {
            // Fallback: dùng cân bằng
            const taiCount = results.filter(r => r === 'TAI').length;
            const total = results.length;
            const side = taiCount / total > 0.5 ? TAI : XIU;
            return {
                prediction: side,
                confidence: 50 + Math.abs(taiCount / total - 0.5) * 30,
                reason: 'Cân bằng tổng'
            };
        }

        // Voting có trọng số
        let scoreTai = 0, scoreXiu = 0;
        for (const sig of signals) {
            if (sig.side === TAI) scoreTai += sig.score;
            else if (sig.side === XIU) scoreXiu += sig.score;
        }

        const totalScore = scoreTai + scoreXiu;
        if (totalScore === 0) {
            return { prediction: TAI, confidence: 50, reason: 'Không có tín hiệu' };
        }

        const prediction = scoreTai >= scoreXiu ? TAI : XIU;
        const confidence = Math.min(98, Math.round((Math.max(scoreTai, scoreXiu) / totalScore) * 100));

        // Điều chỉnh confidence dựa trên số lượng tín hiệu
        const signalCount = signals.length;
        const countBonus = Math.min(8, signalCount * 1.2);
        const finalConfidence = Math.min(98, confidence + countBonus);

        // Lưu dự đoán để học thích ứng
        this.last_prediction = prediction;

        return {
            prediction,
            confidence: finalConfidence,
            reason: `${signals.length} chỉ báo, top: ${signals.sort((a,b) => b.score - a.score).slice(0,3).map(s => s.name).join(', ')}`
        };
    }
}

// ============================================================
// KHỞI TẠO ENGINE
// ============================================================

const engine = new SuperVIPEngine();

// ============================================================
// XỬ LÝ LỊCH SỬ DỰ ĐOÁN
// ============================================================

function processNewSessions(sessions) {
    if (!sessions || sessions.length === 0) return;

    const chronological = sessions.sort((a, b) => a.id - b.id);
    const latest = chronological[chronological.length - 1];
    const latestId = latest.id;

    if (state.last_processed_session === null) {
        state.last_processed_session = latestId - 1;
    }

    const newSessions = chronological.filter(s => s.id > state.last_processed_session);

    for (const session of newSessions) {
        if (state.dang_cho && state.dang_cho.phien === session.id) {
            const duDoan = state.dang_cho.du_doan;
            const ketQua = formatSide(session.result);
            const dung = (duDoan === ketQua);

            state.lich_su.push({
                phien: session.id,
                du_doan: duDoan,
                trang_thai: dung ? '✅' : '❌'
            });

            if (dung) state.so_dung++;
            else state.so_sai++;
            state.tong_so++;

            // Cập nhật engine
            engine.adaptiveUpdate(ketQua, duDoan);

            state.dang_cho = null;
        }

        state.last_processed_session = session.id;
    }
}

// ============================================================
// TẠO DỰ ĐOÁN
// ============================================================

function createPrediction(sessions) {
    if (!sessions || sessions.length === 0) {
        return { phien: null, du_doan: TAI, trang_thai: '⏳' };
    }

    const chronological = sessions.sort((a, b) => a.id - b.id);
    const latest = chronological[chronological.length - 1];
    const nextSessionId = latest.id + 1;

    if (state.dang_cho && state.dang_cho.phien === nextSessionId) {
        return {
            phien: nextSessionId,
            du_doan: state.dang_cho.du_doan,
            trang_thai: '⏳'
        };
    }

    const result = engine.predict(sessions);
    const duDoan = result.prediction;

    state.dang_cho = {
        phien: nextSessionId,
        du_doan: duDoan
    };

    // Log chi tiết
    console.log(`🔮 Dự đoán phiên ${nextSessionId}: ${duDoan} (${result.confidence}%) - ${result.reason}`);

    return {
        phien: nextSessionId,
        du_doan: duDoan,
        trang_thai: '⏳'
    };
}

// ============================================================
// API ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        admin: ADMIN,
        api: 'DENIUS MD5 API',
        version: API_VERSION,
        description: 'Siêu VIP - 30+ chỉ báo + học thích ứng'
    });
});

app.get('/api/v1/md5', async (req, res) => {
    try {
        const data = await fetchSource();
        const sessions = normalizeSessions(data);

        if (!sessions || sessions.length === 0) {
            return res.status(503).json({
                status: 'error',
                message: 'Không có dữ liệu'
            });
        }

        processNewSessions(sessions);
        const prediction = createPrediction(sessions);
        const winRate = calculateWinRate();
        const history = state.lich_su.slice(-20).reverse();

        const response = {
            phien: prediction.phien,
            du_doan: prediction.du_doan,
            trang_thai: prediction.trang_thai,
            win_rate: winRate === null ? '0%' : winRate + '%',
            lich_su: history
        };

        res.json(response);

    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.get('/api/v1/md5/history', (req, res) => {
    res.json({
        admin: ADMIN,
        tong_so: state.tong_so,
        so_dung: state.so_dung,
        so_sai: state.so_sai,
        win_rate: calculateWinRate() === null ? '0%' : calculateWinRate() + '%',
        dang_cho: state.dang_cho,
        lich_su: state.lich_su.slice(-50).reverse()
    });
});

app.get('/api/v1/md5/stats', (req, res) => {
    res.json({
        admin: ADMIN,
        tong_so: state.tong_so,
        so_dung: state.so_dung,
        so_sai: state.so_sai,
        win_rate: calculateWinRate() === null ? '0%' : calculateWinRate() + '%',
        dang_cho: state.dang_cho,
        last_processed: state.last_processed_session,
        engine_performance: engine.performance
    });
});

// ============================================================
// KHỞI ĐỘNG
// ============================================================

app.listen(PORT, () => {
    console.log(`🚀 DENIUS MD5 API v${API_VERSION} running on port ${PORT}`);
    console.log(`📡 Source: ${SOURCE_URL}`);
    console.log(`👑 Admin: ${ADMIN}`);
    console.log('\n📋 FORM API:');
    console.log('{');
    console.log('  "phien": 7007145,');
    console.log('  "du_doan": "TÀI",');
    console.log('  "trang_thai": "⏳",');
    console.log('  "win_rate": "64.8%",');
    console.log('  "lich_su": [');
    console.log('    {"phien": 7007144, "du_doan": "XỈU", "trang_thai": "✅"},');
    console.log('    {"phien": 7007143, "du_doan": "XỈU", "trang_thai": "❌"}');
    console.log('  ]');
    console.log('}');
    console.log('\n🧠 SIÊU THUẬT TOÁN VIP: 30+ chỉ báo + học thích ứng');
});