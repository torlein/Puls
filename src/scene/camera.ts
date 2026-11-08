// Kamera som glir mellom faste visninger. Brukeren kan rotere og zoome rundt
// visningen, og knappen Oversikt nullstiller.

import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

export interface ViewDef {
  target: Vector3;
  /** Halv bredde og høyde av området som skal få plass i bildet. */
  halfW: number;
  halfH: number;
  yaw: number;
  pitch: number;
}

interface State {
  target: Vector3;
  yaw: number;
  pitch: number;
  dist: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  readonly camera: PerspectiveCamera;
  private view: ViewDef;
  private state: State;
  private from: State | null = null;
  private progress = 1;
  private duration = 1.15;
  userYaw = 0;
  userPitch = 0;
  zoom = 1;

  constructor(view: ViewDef, aspect: number) {
    this.camera = new PerspectiveCamera(30, aspect, 0.1, 250);
    this.view = view;
    this.state = this.stateFor(view);
    this.apply();
  }

  private fit(view: ViewDef): number {
    const tanV = Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const tanH = tanV * this.camera.aspect;
    return Math.max(view.halfH / tanV, view.halfW / tanH) + 1.2;
  }

  private stateFor(view: ViewDef): State {
    return { target: view.target.clone(), yaw: view.yaw, pitch: view.pitch, dist: this.fit(view) };
  }

  /** Den samlede tilstanden, med brukerens rotasjon og zoom. */
  private effective(): State {
    return {
      target: this.state.target.clone(),
      yaw: this.state.yaw + this.userYaw,
      pitch: MathUtils.clamp(this.state.pitch + this.userPitch, -0.7, 1.15),
      dist: this.state.dist * this.zoom,
    };
  }

  setView(view: ViewDef, instant: boolean): void {
    const current = this.effective();
    this.view = view;
    this.userYaw = 0;
    this.userPitch = 0;
    this.zoom = 1;
    const target = this.stateFor(view);
    if (instant) {
      this.from = null;
      this.progress = 1;
      this.state = target;
    } else {
      this.from = current;
      this.state = target;
      this.progress = 0;
    }
    this.apply();
  }

  /** Kalles når størrelsen på lerretet endres. */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.state.dist = this.fit(this.view);
    this.apply();
  }

  rotate(dYaw: number, dPitch: number): void {
    this.finishTransition();
    this.userYaw += dYaw;
    const base = this.state.pitch;
    this.userPitch = MathUtils.clamp(this.userPitch + dPitch, -0.7 - base, 1.15 - base);
    this.apply();
  }

  zoomBy(factor: number): void {
    this.finishTransition();
    this.zoom = MathUtils.clamp(this.zoom * factor, 0.35, 2.4);
    this.apply();
  }

  private finishTransition(): void {
    this.from = null;
    this.progress = 1;
  }

  get moving(): boolean {
    return this.progress < 1;
  }

  update(dt: number): boolean {
    if (this.progress >= 1) return false;
    this.progress = Math.min(1, this.progress + dt / this.duration);
    this.apply();
    if (this.progress >= 1) this.from = null;
    return true;
  }

  private apply(): void {
    let s = this.effective();
    if (this.from && this.progress < 1) {
      const k = ease(this.progress);
      const a = this.from;
      s = {
        target: a.target.clone().lerp(s.target, k),
        yaw: MathUtils.lerp(a.yaw, s.yaw, k),
        pitch: MathUtils.lerp(a.pitch, s.pitch, k),
        dist: Math.exp(MathUtils.lerp(Math.log(a.dist), Math.log(s.dist), k)),
      };
    }
    const cp = Math.cos(s.pitch);
    this.camera.position.set(
      s.target.x + Math.sin(s.yaw) * cp * s.dist,
      s.target.y + Math.sin(s.pitch) * s.dist,
      s.target.z + Math.cos(s.yaw) * cp * s.dist,
    );
    this.camera.lookAt(s.target);
    this.camera.updateMatrixWorld();
  }
}
