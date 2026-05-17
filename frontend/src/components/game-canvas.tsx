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

  const zoom = clamp(Math.min(size.width, size.height) / Math.max(renderState.safeRadius * 1.7, 1), 0.22, 0.58);
  zoomRef.current = zoom;
  camera.x = lerp(camera.x, head.x, 0.14);
  camera.y = lerp(camera.y, head.y, 0.14);

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
  drawGrid(context, view, palette.border);
  drawHazard(context, view, renderState.safeRadius, palette.mapHazard, palette.mapHazardSoft);
  drawFood(context, renderState.food, view, palette, time);
  drawSnakes(context, snakes, currentPlayerId, palette, snakeSkinIds, view);
  drawLabels(context, snakes, currentPlayerId, palette, snakeSkinIds, view, zoom, renderState.elapsedMs);

  context.restore();
}

function drawArenaFloor(
  context: CanvasRenderingContext2D,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  palette: ThemePalette,
  time: number
) {
  const gradient = context.createLinearGradient(view.minX, view.minY, view.maxX, view.maxY);
  gradient.addColorStop(0, palette.background);
  gradient.addColorStop(0.5, palette.ember);
  gradient.addColorStop(1, palette.background);
  context.globalAlpha = 0.8;
  context.fillStyle = gradient;
  context.fillRect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);

  for (let index = 0; index < 12; index += 1) {
    const x = Math.sin(index * 12.31) * 1550;
    const y = Math.cos(index * 8.17) * 1550;
    const radius = 170 + (index % 4) * 38 + Math.sin(time * 0.0015 + index) * 18;
    if (x + radius < view.minX || x - radius > view.maxX || y + radius < view.minY || y - radius > view.maxY) {
      continue;
    }

    const pool = context.createRadialGradient(x, y, radius * 0.18, x, y, radius);
    pool.addColorStop(0, palette.mapHazardSoft);
    pool.addColorStop(0.45, palette.mapHazard);
    pool.addColorStop(1, "rgba(0,0,0,0)");
    context.globalAlpha = 0.24;
    context.fillStyle = pool;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
}

function drawGrid(
  context: CanvasRenderingContext2D,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  borderColor: string
) {
  const hexRadius = 54;
  const hexWidth = Math.sqrt(3) * hexRadius;
  const rowHeight = hexRadius * 1.5;
  const startRow = Math.floor(view.minY / rowHeight) - 2;
  const endRow = Math.ceil(view.maxY / rowHeight) + 2;
  const startCol = Math.floor(view.minX / hexWidth) - 2;
  const endCol = Math.ceil(view.maxX / hexWidth) + 2;

  context.strokeStyle = borderColor;
  context.lineWidth = 4;
  context.globalAlpha = 0.12;

  for (let row = startRow; row <= endRow; row += 1) {
    const y = row * rowHeight;
    const rowOffset = row % 2 === 0 ? 0 : hexWidth / 2;
    for (let col = startCol; col <= endCol; col += 1) {
      const x = col * hexWidth + rowOffset;
      drawHexCell(context, x, y, hexRadius);
    }
  }

  context.globalAlpha = 1;
}

function drawHazard(
  context: CanvasRenderingContext2D,
  view: { minX: number; maxX: number; minY: number; maxY: number },
  safeRadius: number,
  hazardColor: string,
  hazardSoftColor: string
) {
  context.save();
  context.beginPath();
  context.rect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  context.arc(0, 0, safeRadius, 0, Math.PI * 2, true);
  context.clip("evenodd");
  context.fillStyle = hazardSoftColor;
  context.globalAlpha = 0.12;
  context.fillRect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  context.restore();

  context.strokeStyle = hazardColor;
  context.globalAlpha = 0.9;
  context.lineWidth = 12;
  context.beginPath();
  context.arc(0, 0, safeRadius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.24;
  context.lineWidth = 32;
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

    const pulse = 1 + Math.sin(time * 0.008 + item.x * 0.01 + item.y * 0.01) * 0.16;
    const radius = item.id.startsWith("food:") ? 8.5 * pulse : 11 * pulse;
    const hue = Math.abs(Math.round((item.x * 0.11 + item.y * 0.07) % 360));
    const glowColor =
      item.value > 1 ? palette.mapHazard : `oklch(0.84 0.19 ${hue.toString()})`;

    context.save();
    context.globalAlpha = 0.42;
    context.fillStyle = glowColor;
    context.beginPath();
    context.arc(item.x, item.y, radius * 1.8, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.fillStyle = glowColor;
    context.beginPath();
    context.arc(item.x, item.y, radius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "rgba(255,255,255,0.78)";
    context.globalAlpha = 0.72;
    context.beginPath();
    context.arc(item.x - radius * 0.25, item.y - radius * 0.25, radius * 0.36, 0, Math.PI * 2);
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
  view: { minX: number; maxX: number; minY: number; maxY: number }
) {
  for (const snake of snakes) {
    const head = snake.segments[0];
    if (!head || head.x < view.minX - 200 || head.x > view.maxX + 200 || head.y < view.minY - 200 || head.y > view.maxY + 200) {
      continue;
    }

    const skin = getSnakeSkin(snakeSkinIds[snake.id]);
    const outline = snake.id === currentPlayerId ? skin.accent : palette.border;

    context.save();
    context.strokeStyle = skin.glow;
    context.globalAlpha = snake.alive ? 0.22 : 0.08;
    context.lineCap = "round";
    context.lineJoin = "round";
      context.lineWidth = 18;
    context.beginPath();
    snake.segments.forEach((segment, index) => {
      if (index === 0) {
        context.moveTo(segment.x, segment.y);
      } else {
        context.lineTo(segment.x, segment.y);
      }
    });
    context.stroke();
    context.restore();

    for (let index = snake.segments.length - 1; index >= 0; index -= 1) {
      const segment = snake.segments[index];
      if (!segment) {
        continue;
      }
      const radius = index === 0 ? 22 : Math.max(7.5, 17.2 - index * 0.12);

      context.fillStyle = skin.glow;
      context.globalAlpha = snake.alive ? 0.24 : 0.08;
      context.beginPath();
      context.arc(segment.x, segment.y, radius * 1.3, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = skin.body;
      context.globalAlpha = snake.alive ? 1 : 0.32;
      context.beginPath();
      context.arc(segment.x, segment.y, radius, 0, Math.PI * 2);
      context.fill();

      if (index === 0 || index % 2 === 0) {
        context.fillStyle = skin.accent;
        context.globalAlpha = snake.alive ? 0.24 : 0.1;
        context.beginPath();
        context.ellipse(
          segment.x + Math.cos(snake.angle) * radius * 0.12,
          segment.y + Math.sin(snake.angle) * radius * 0.12,
          radius * 0.52,
          radius * 0.34,
          snake.angle,
          0,
          Math.PI * 2
        );
        context.fill();
      }

      if (index === 0) {
        context.strokeStyle = outline;
        context.lineWidth = 2.8;
        context.beginPath();
        context.arc(segment.x, segment.y, radius, 0, Math.PI * 2);
        context.stroke();

        const eyeOffset = radius * 0.42;
        const eyeRadius = 5.2;
        const forwardX = Math.cos(snake.angle);
        const forwardY = Math.sin(snake.angle);
        const sideX = -forwardY;
        const sideY = forwardX;

        drawEye(context, segment.x, segment.y, forwardX, forwardY, sideX, sideY, eyeOffset, eyeRadius, 1);
        drawEye(context, segment.x, segment.y, forwardX, forwardY, sideX, sideY, -eyeOffset, eyeRadius, -1);
      }
    }

    context.globalAlpha = 1;
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

  context.font = "600 24px Inter, sans-serif";
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
    context.globalAlpha = snake.alive ? 0.9 : 0.45;
    context.fillText(snake.name, head.x, head.y - 28);
  }

  context.globalAlpha = 1;
}

function drawHexCell(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
    const pointX = x + radius * Math.cos(angle);
    const pointY = y + radius * Math.sin(angle);
    if (index === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }
  context.closePath();
  context.stroke();
}

function readPalette(): ThemePalette {
  if (typeof window === "undefined") {
    return {
      background: "#0f0f06",
      foreground: "#f5f4ec",
      border: "rgba(255,255,255,0.16)",
      primary: "#e3dc3a",
      accent: "#eee977",
      muted: "rgba(255,255,255,0.55)",
      danger: "#ff5d73",
      mapHazard: "#f05f34",
      mapHazardSoft: "#f69a78",
      ember: "rgba(255,120,72,0.18)"
    };
  }

  const styles = window.getComputedStyle(document.documentElement);

  return {
    background: resolveCanvasColor(styles.getPropertyValue("--background"), "#0f0f06"),
    foreground: resolveCanvasColor(styles.getPropertyValue("--foreground"), "#f5f4ec"),
    border: resolveCanvasColor(styles.getPropertyValue("--border"), "rgba(255,255,255,0.16)"),
    primary: resolveCanvasColor(styles.getPropertyValue("--primary"), "#e3dc3a"),
    accent: resolveCanvasColor(styles.getPropertyValue("--accent"), "#eee977"),
    muted: resolveCanvasColor(styles.getPropertyValue("--muted-foreground"), "rgba(255,255,255,0.55)"),
    danger: resolveCanvasColor(styles.getPropertyValue("--destructive"), "#ff5d73"),
    mapHazard: resolveCanvasColor(styles.getPropertyValue("--map-hazard"), "#f05f34"),
    mapHazardSoft: resolveCanvasColor(styles.getPropertyValue("--map-hazard-soft"), "#f69a78"),
    ember: resolveCanvasColor(styles.getPropertyValue("--ember"), "rgba(255,120,72,0.18)")
  };
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveCanvasColor(candidate: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return fallback;
  }

  context.fillStyle = fallback;
  const initial = context.fillStyle;
  const trimmed = candidate.trim();
  if (!trimmed) {
    return typeof initial === "string" ? initial : fallback;
  }

  context.fillStyle = trimmed;
  const resolved = context.fillStyle;
  if (typeof resolved !== "string") {
    return fallback;
  }

  return resolved || fallback;
}
