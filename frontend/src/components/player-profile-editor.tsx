"use client";

import { useEffect, useState } from "react";
import {
  createRandomAlias,
  getSnakeSkin,
  readPlayerProfile,
  savePlayerProfile,
  SNAKE_SKINS,
  type PlayerProfile,
  type SnakeSkinId
} from "@/lib/player-profile";

interface PlayerProfileEditorProps {
  title: string;
  description: string;
  compact?: boolean;
}

export function PlayerProfileEditor({ title, description, compact = false }: PlayerProfileEditorProps) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  useEffect(() => {
    setProfile(readPlayerProfile());
  }, []);

  const activeSkin = getSnakeSkin(profile?.skinId);

  function updateProfile(next: PlayerProfile) {
    setProfile(savePlayerProfile(next));
  }

  return (
    <div className={`profile-editor ${compact ? "profile-editor--compact" : ""}`}>
      <div className="section-heading">
        <div>
          <h2 className="section-title">{title}</h2>
        </div>
        <span className="status-pill">{activeSkin.label}</span>
      </div>
      <p className="muted">{description}</p>

      <div className="field-stack">
        <label className="field">
          <span>Snake alias</span>
          <input
            className="input"
            maxLength={18}
            onChange={(event) => {
              const current = profile ?? readPlayerProfile();
              setProfile({
                ...current,
                name: event.target.value.slice(0, 18)
              });
            }}
            onBlur={() => {
              const current = profile ?? readPlayerProfile();
              updateProfile({
                ...current,
                name: current.name
              });
            }}
            placeholder="Pick your arena name"
            value={profile?.name ?? ""}
          />
        </label>

        <div className="button-row">
          <button
            className="button"
            onClick={() => {
              const current = profile ?? readPlayerProfile();
              updateProfile({
                ...current,
                name: createRandomAlias()
              });
            }}
            type="button"
          >
            Randomize codename
          </button>
        </div>

        <div className="field">
          <span>Snake skin</span>
          <div className="skin-grid">
            {SNAKE_SKINS.map((skin) => {
              const active = profile?.skinId === skin.id;
              return (
                <button
                  className={`button skin-chip ${active ? "is-active" : ""}`}
                  key={skin.id}
                  onClick={() => {
                    const current = profile ?? readPlayerProfile();
                    updateProfile({
                      ...current,
                      skinId: skin.id as SnakeSkinId
                    });
                  }}
                  type="button"
                >
                  <span className="skin-swatch" style={{ background: skin.body }} />
                  <span className="skin-meta">
                    <strong>{skin.label}</strong>
                    <span>{skin.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <span>Codename</span>
          <strong>{profile?.name ?? "Loading..."}</strong>
        </div>
        <div className="detail-card">
          <span>Selected skin</span>
          <strong>{activeSkin.label}</strong>
        </div>
      </div>
    </div>
  );
}
