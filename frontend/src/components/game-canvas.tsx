"use client";

import type { Food, MatchConfig, Placement, Snake } from "@/lib/game/core";
import { getSnakeSkin, type SnakeSkinId } from "@/lib/player-profile";
import { useEffect, useRef, type MutableRefObject } from "react";

export interface ArenaRenderState {
  phase: string;
  tick: number;
  elapsedMs: number;
  safeRadius: number;
  config: MatchConfig;
  snakes: Record<string, Snake>;
  food: Food[];
  placements: Placement[];
}

interface GameCanvasProps {
  renderStateRef: MutableRefObject<ArenaRenderState>;
  currentPlayerIdRef: MutableRefObject<string>;
  pointerAngleRef: MutableRefObject<number>;
  boostActiveRef: MutableRefObject<boolean>;
  snakeSkinIdsRef: MutableRefObject<Record<string, SnakeSkinId>>;
}

interface ThemePalette {
  background: string;
  foreground: string;
  border: string;
  primary: string;
  accent: string;
  muted: string;
  danger: string;
  mapHazard: string;
  mapHazardSoft: string;
  ember: string;
}

export function GameCanvas(props: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const zoomRef = useRef(0.24);
  const cameraRef = useRef({ x: 0, y: 0 });
  const paletteRef = useRef<ThemePalette>(readPalette());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    contextRef.current = canvas.getContext("2d", { alpha: false });
    if (!contextRef.current) {
      return;
    }

    const resize = () => {
      const target = canvas.parentElement;
      const width = Math.max(1, target?.clientWidth ?? window.innerWidth);
      const height = Math.max(1, target?.clientHeight ?? window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      sizeRef.current = { width, height, dpr };
      contextRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    const mutationObserver = new MutationObserver(() => {
      paletteRef.current = readPalette();
    });

    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    resize();
    paletteRef.current = readPalette();

    const loop = (time: number) => {
      drawFrame({
        context: contextRef.current,
        size: sizeRef.current,
        camera: cameraRef.current,
        zoomRef,
        palette: paletteRef.current,
        renderState: props.renderStateRef.current,
        currentPlayerId: props.currentPlayerIdRef.current,
        snakeSkinIds: props.snakeSkinIdsRef.current,
        time
      });

      animationRef.current = window.requestAnimationFrame(loop);
    };

    animationRef.current = window.requestAnimationFrame(loop);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [props.currentPlayerIdRef, props.renderStateRef, props.snakeSkinIdsRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const updatePointer = (clientX: number, clientY: number) => {
      const state = props.renderStateRef.current;
      const snakes = Object.values(state.snakes);
      const localSnake = state.snakes[props.currentPlayerIdRef.current] ?? snakes[0];
      const head = localSnake?.segments[0];
      if (!head) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const localX = clientX - rect.left - rect.width / 2;
      const localY = clientY - rect.top - rect.height / 2;
      const zoom = zoomRef.current || 0.24;
      const worldX = cameraRef.current.x + localX / zoom;
      const worldY = cameraRef.current.y + localY / zoom;

      props.pointerAngleRef.current = Math.atan2(worldY - head.y, worldX - head.x);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updatePointer(event.clientX, event.clientY);
    };

    const setBoost = (value: boolean) => {
      props.boostActiveRef.current = value;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button === 0) {
        updatePointer(event.clientX, event.clientY);
        setBoost(true);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 0) {
        setBoost(false);
      }
    };

    const handlePointerLeave = () => {
      setBoost(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setBoost(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setBoost(false);
      }
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("blur", handlePointerLeave);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("blur", handlePointerLeave);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [props.boostActiveRef, props.currentPlayerIdRef, props.pointerAngleRef, props.renderStateRef]);

  return <canvas aria-label="Kudoku arena" className="arena-canvas" ref={canvasRef} />;
}

function drawFrame(input: {
  context: CanvasRenderingContext2D | null;
  size: { width: number; height: number; dpr: number };
  camera: { x: number; y: number };
  zoomRef: MutableRefObject<number>;
  palette: ThemePalette;
  renderState: ArenaRenderState;
  currentPlayerId: string;
  snakeSkinIds: Record<string, SnakeSkinId>;
  time: number;
}) {
  const { context, size, camera, zoomRef, palette, renderState, currentPlayerId, snakeSkinIds, time } = input;
  if (!context) {
    return;
  }

  const snakes = Object.values(renderState.snakes ?? {});
  const localSnake = renderState.snakes[currentPlayerId] ?? snakes[0];
  const head = localSnake?.segments[0] ?? { x: 0, y: 0 };
  const localLength = Math.max(localSnake?.segments.length ?? 0, 18);
  const arenaScale = clamp(renderState.safeRadius / 2_000, 0.42, 1.9);
  const zoom = clamp(Math.min(size.width, size.height) / (340 * arenaScale + localLength * 4.3), 0.34, 0.9);
  zoomRef.current = zoom;
  camera.x = lerp(camera.x, head.x, 0.22);
  camera.y = lerp(camera.y, head.y, 0.22);

  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, size.width, size.height);

  context.save();
  context.translate(size.width / 2, size.height / 2);
  context.scale(zoom, zoom);
  context.translate(-camera.x, -camera.y);

  const visibleWidth = size.width / zoom;
  const visibleHeight = size.height / zoom;
  const view = {
    minX: camera.x - visibleWidth / 2 - 120,
    maxX: camera.x + visibleWidth / 2 + 120,
    minY: camera.y - visibleHeight / 2 - 120,
    maxY: camera.y + visibleHeight / 2 + 120
  };

  drawArenaFloor(context, view, palette, time);
  drawBoundary(context, view, renderState.safeRadius, palette);
  drawFood(context, renderState.food, view, palette, time);
  drawSnakes(context, snakes, currentPlayerId, palette, snakeSkinIds, view, time);
  drawLabels(context, snakes, currentPlayerId, palette, snakeSkinIds, view, zoom, renderState.elapsedMs);

  context.restore();
}

function drawArenaFloor(
  context: CanvasRenderingContext2D,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  palette: ThemePalette,
  time: number
) {
  const gradient = context.createRadialGradient(0, 0, 120, 0, 0, Math.max(view.maxX - view.minX, view.maxY - view.minY));
  gradient.addColorStop(0, palette.ember);
  gradient.addColorStop(0.55, palette.background);
  gradient.addColorStop(1, "#1d1f1c");
  context.globalAlpha = 1;
  context.fillStyle = gradient;
  context.fillRect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);

  const tileSize = 180;
  const startTileX = Math.floor(view.minX / tileSize) - 2;
  const endTileX = Math.ceil(view.maxX / tileSize) + 2;
  const startTileY = Math.floor(view.minY / tileSize) - 2;
  const endTileY = Math.ceil(view.maxY / tileSize) + 2;

  for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      const seed = hash2d(tileX, tileY);
      const centerX = tileX * tileSize + 28 + (seed % 124);
      const centerY = tileY * tileSize + 22 + ((seed >> 4) % 124);
      const radius = 10 + (seed % 4) * 3;
      const shimmer = 0.03 + (((seed >> 6) % 10) / 200) + Math.sin(time * 0.0018 + seed) * 0.01;

      context.globalAlpha = shimmer;
      context.fillStyle = palette.border;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      context.globalAlpha = shimmer * 0.7;
      context.fillStyle = palette.foreground;
      context.beginPath();
      context.arc(centerX - radius * 0.2, centerY - radius * 0.2, radius * 0.34, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.globalAlpha = 1;
}

function drawBoundary(
  context: CanvasRenderingContext2D,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  safeRadius: number,
  palette: ThemePalette
) {
  context.save();
  context.beginPath();
  context.rect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  context.arc(0, 0, safeRadius, 0, Math.PI * 2, true);
  context.clip("evenodd");
  context.fillStyle = "rgba(5, 7, 8, 0.34)";
  context.globalAlpha = 1;
  context.fillRect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  context.restore();

  context.strokeStyle = palette.mapHazardSoft;
  context.globalAlpha = 0.35;
  context.lineWidth = 10;
  context.beginPath();
  context.arc(0, 0, safeRadius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.1;
  context.lineWidth = 30;
  context.beginPath();
  context.arc(0, 0, safeRadius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawFood(
  context: CanvasRenderingContext2D,
  food: Food[],
  view: { minX: number; maxX: number; minY: number; maxY: number },
  palette: ThemePalette,
  time: number
) {
  for (const item of food) {
    if (item.x < view.minX || item.x > view.maxX || item.y < view.minY || item.y > view.maxY) {
      continue;
    }

    const pulse = 1 + Math.sin(time * 0.008 + item.x * 0.01 + item.y * 0.01) * 0.14;
    const radius = (item.id.startsWith("food:") ? 7.8 : 9.4) * pulse;
    const glowColor = resolveFoodColor(item.id, item.value, palette);

    context.save();
    context.globalAlpha = 0.34;
    context.fillStyle = glowColor;
    context.beginPath();
    context.arc(item.x, item.y, radius * 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = glowColor;
    context.beginPath();
    context.arc(item.x, item.y, radius, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = 0.5;
    context.fillStyle = "rgba(255,255,255,0.22)";
    context.beginPath();
    context.arc(item.x, item.y, radius * 0.72, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(255,255,255,0.78)";
    context.globalAlpha = 0.84;
    context.beginPath();
    context.arc(item.x - radius * 0.26, item.y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }
}

function drawSnakes(
  context: CanvasRenderingContext2D,
  snakes: Snake[],
  currentPlayerId: string,
  palette: ThemePalette,
  snakeSkinIds: Record<string, SnakeSkinId>,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  time: number
) {
  for (const snake of snakes) {
    const head = snake.segments[0];
    if (!head || head.x < view.minX - 200 || head.x > view.maxX + 200 || head.y < view.minY - 200 || head.y > view.maxY + 200) {
      continue;
    }

    const skin = getSnakeSkin(snakeSkinIds[snake.id]);
    const bodyRadius = resolveSnakeRadius(snake);
    const outline = snake.id === currentPlayerId ? skin.accent : "rgba(255,255,255,0.32)";
    const boostGlow = 0.1 + snake.boostCharge * 0.34 + Math.sin(time * 0.02 + snake.segments.length) * 0.02;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    traceSnakePath(context, snake.segments, 0, bodyRadius * 0.52);
    context.strokeStyle = "rgba(0,0,0,0.3)";
    context.lineWidth = bodyRadius * 2.1;
    context.globalAlpha = snake.alive ? 0.4 : 0.18;
    context.stroke();

    if (snake.boostCharge > 0.03) {
      traceSnakePath(context, snake.segments);
      context.strokeStyle = skin.glow;
      context.lineWidth = bodyRadius * (2.45 + snake.boostCharge * 0.9);
      context.globalAlpha = 0.2 + snake.boostCharge * 0.4;
      context.shadowBlur = 24 + snake.boostCharge * 28;
      context.shadowColor = skin.glow;
      context.stroke();
      context.shadowBlur = 0;
    }

    traceSnakePath(context, snake.segments);
    context.strokeStyle = skin.glow;
    context.lineWidth = bodyRadius * 2.02;
    context.globalAlpha = snake.alive ? boostGlow : 0.1;
    context.stroke();

    traceSnakePath(context, snake.segments);
    context.strokeStyle = snake.alive ? skin.body : "rgba(120,120,120,0.6)";
    context.lineWidth = bodyRadius * 1.72;
    context.globalAlpha = snake.alive ? 1 : 0.4;
    context.stroke();

    traceSnakePath(context, snake.segments);
    context.strokeStyle = snake.alive ? skin.accent : "rgba(255,255,255,0.16)";
    context.lineWidth = bodyRadius * 0.68;
    context.globalAlpha = snake.alive ? 0.28 : 0.12;
    context.stroke();

    context.globalAlpha = snake.alive ? 1 : 0.42;
    context.fillStyle = snake.alive ? skin.body : "rgba(145,145,145,0.7)";
    context.beginPath();
    context.arc(head.x, head.y, bodyRadius, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = outline;
    context.lineWidth = 2.6;
    context.beginPath();
    context.arc(head.x, head.y, bodyRadius, 0, Math.PI * 2);
    context.stroke();

    const eyeOffset = bodyRadius * 0.48;
    const eyeRadius = Math.max(4.8, bodyRadius * 0.24);
    const forwardX = Math.cos(snake.angle);
    const forwardY = Math.sin(snake.angle);
    const sideX = -forwardY;
    const sideY = forwardX;

    drawEye(context, head.x, head.y, forwardX, forwardY, sideX, sideY, eyeOffset, eyeRadius, 1);
    drawEye(context, head.x, head.y, forwardX, forwardY, sideX, sideY, -eyeOffset, eyeRadius, -1);
    context.restore();
  }
}

function drawEye(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  forwardX: number,
  forwardY: number,
  sideX: number,
  sideY: number,
  lateralOffset: number,
  eyeRadius: number,
  pupilDirection: number
) {
  const eyeX = x + forwardX * eyeRadius * 1.8 + sideX * lateralOffset * 0.68;
  const eyeY = y + forwardY * eyeRadius * 1.8 + sideY * lateralOffset * 0.68;

  context.fillStyle = "#fff8eb";
  context.globalAlpha = 0.98;
  context.beginPath();
  context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#1f1308";
  context.beginPath();
  context.arc(
    eyeX + forwardX * eyeRadius * 0.45 + sideX * pupilDirection * 0.6,
    eyeY + forwardY * eyeRadius * 0.45 + sideY * pupilDirection * 0.6,
    eyeRadius * 0.42,
    0,
    Math.PI * 2
  );
  context.fill();
}

function drawLabels(
  context: CanvasRenderingContext2D,
  snakes: Snake[],
  currentPlayerId: string,
  palette: ThemePalette,
  snakeSkinIds: Record<string, SnakeSkinId>,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  zoom: number,
  elapsedMs: number
) {
  if (zoom < 0.18 || elapsedMs > 10_000) {
    return;
  }

  context.font = "700 20px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const snake of snakes) {
    if (snake.id !== currentPlayerId) {
      continue;
    }

    const head = snake.segments[0];
    if (!head || head.x < view.minX || head.x > view.maxX || head.y < view.minY || head.y > view.maxY) {
      continue;
    }

    const skin = getSnakeSkin(snakeSkinIds[snake.id]);
      context.fillStyle = snake.id === currentPlayerId ? skin.accent : palette.muted;
      context.globalAlpha = snake.alive ? 0.92 : 0.45;
      context.fillText(snake.name, head.x, head.y - 32);
  }

  context.globalAlpha = 1;
}

function readPalette(): ThemePalette {
  return {
    background: "#2b2f2b",
    foreground: "#f7f3df",
    border: "rgba(255,255,255,0.08)",
    primary: "#ffe073",
    accent: "#fff3be",
    muted: "rgba(255,255,255,0.72)",
    danger: "#ff725f",
    mapHazard: "#d45a47",
    mapHazardSoft: "rgba(255,150,120,0.66)",
    ember: "#353b34"
  };
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function traceSnakePath(
  context: CanvasRenderingContext2D,
  segments: Snake["segments"],
  offset = 0,
  shadowOffset = 0
) {
  context.beginPath();
  segments.forEach((segment, index) => {
    const x = segment.x;
    const y = segment.y + shadowOffset;
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }

    if (index % 2 === 0 && offset > 0) {
      context.lineTo(x, y + offset);
      return;
    }

    context.lineTo(x, y);
  });
}

function resolveSnakeRadius(snake: Snake | undefined) {
  if (!snake) {
    return 18;
  }

  return clamp(16 + (snake.mass - 12) * 0.18, 16, 30);
}

function hash2d(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return Math.abs(Math.floor((value - Math.floor(value)) * 100000));
}

function resolveFoodColor(id: string, value: number, palette: ThemePalette) {
  if (value > 1) {
    return palette.mapHazard;
  }

  const colors = [
    "#ff5a76",
    "#5ee27f",
    "#67c9ff",
    "#ffd54f",
    "#c58bff",
    "#ff9d57"
  ] as const;
  return colors[hashString(id) % colors.length] ?? palette.primary;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return Math.abs(hash);
}
