/**
 * Root of the extension
 */
import * as vscode from 'vscode';

import rollbar from './rollbar';
import {KitManager, Kit} from './kit';
import {StateManager} from './state';
import {CMakeDriver} from './driver';
import {LegacyCMakeDriver} from './legacy-driver';

/**
 * Class implementing the extension. It's all here!
 */
export class CMakeTools implements vscode.Disposable {
  /**
   * The state manager for the class
   */
  private _stateManager = new StateManager(this.extensionContext);

  /**
   * It's up to the kit manager to do all things related to kits. We only listen
   * to it for kit changes.
   */
  private _kitManager = new KitManager(this._stateManager);

  /**
   * Store the active kit. We keep it around in case we need to restart the
   * CMake driver.
   */
  private _activeKit: Kit | null = null;

  /**
   * The object in charge of talking to CMake
   */
  private _cmakeDriver: CMakeDriver;

  /**
   * Construct a new instance. The instance isn't ready, and must be initalized.
   * @param extensionContext The extension context
   *
   * This is private. You must call `create` to get an instance.
   */
  private constructor(readonly extensionContext: vscode.ExtensionContext) {
    // Handle the active kit changing. We want to do some updates and teardown
    this._kitManager.onActiveKitChanged(kit => {
      rollbar.invokeAsync('Changing CMake kit', async() => {
        this._activeKit = kit;
        if (kit) {
          await this._cmakeDriver.setKit(kit);
        }
      });
    });
  }

  /**
   * Dispose the extension
   */
  dispose() {
    rollbar.invoke('Root dispose', () => {
      this._kitManager.dispose();
      if (this._cmakeDriver) {
        this._cmakeDriver.dispose();
      }
    });
  }

  /**
   * Reload/restarts the CMake Driver
   */
  private async _reloadCMakeDriver() {
    if (this._cmakeDriver) {
      await this._cmakeDriver.asyncDispose();
    }
    this._cmakeDriver = await LegacyCMakeDriver.create();
    if (this._activeKit) {
      await this._cmakeDriver.setKit(this._activeKit);
    }
  }

  /**
   * Two-phase init. Called by `create`.
   */
  private async _init() {
    await rollbar.invokeAsync('Root init', async() => {
      // First, start up Rollbar
      await rollbar.requestPermissions(this.extensionContext);
      // Now start the CMake driver
      await this._reloadCMakeDriver();
      // Start up the kit manager. This will also inject the current kit into
      // the CMake driver
      await this._kitManager.initialize();
    });
  }

  /**
   * Create an instance asynchronously
   * @param ctx The extension context
   *
   * The purpose of making this the only way to create an instance is to prevent
   * us from creating uninitialized instances of the CMake Tools extension.
   */
  static async create(ctx: vscode.ExtensionContext): Promise<CMakeTools> {
    const inst = new CMakeTools(ctx);
    await inst._init();
    return inst;
  }

  /**
   * Implementation of `cmake.editKits`
   */
  editKits() {
    return this._kitManager.openKitsEditor();
  }

  /**
   * Implementation of `cmake.scanForKits`
   */
  scanForKits() {
    return this._kitManager.rescanForKits();
  }

  /**
   * Implementation of `cmake.selectKit`
   */
  selectKit() { return this._kitManager.selectKit(); }

  /**
   * Implementation of `cmake.configure`
   */
  async configure() {
    while (!this._activeKit) {
      await this.selectKit();
    }
    return this._cmakeDriver.configure();
  }
}

export default CMakeTools;