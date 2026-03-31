/// Enable Windows touch keyboard focus tracking.
/// After calling this, the virtual keyboard will appear whenever
/// a text input receives focus — even from programmatic .focus() calls.
///
/// Uses IInputPanelConfiguration COM interface directly via raw vtable,
/// since the windows crate doesn't expose this interface.
///
/// Only effective on Windows. No-op on other platforms.

#[cfg(target_os = "windows")]
pub fn enable_focus_tracking() {
    use windows::Win32::System::Com::{
        CoInitializeEx, COINIT_APARTMENTTHREADED,
    };
    use windows::core::{GUID, Interface};
    use std::ffi::c_void;

    // IInputPanelConfiguration
    // CLSID: {2853ADD3-F096-4C63-A78F-7FA3EA837FB7}
    // IID:   {41C81592-514C-48BD-A22E-E6AF638521A6}
    const CLSID: GUID = GUID::from_u128(0x2853ADD3_F096_4C63_A78F_7FA3EA837FB7);
    const IID: GUID = GUID::from_u128(0x41C81592_514C_48BD_A22E_E6AF638521A6);

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        let mut obj: *mut c_void = std::ptr::null_mut();

        // Raw CoCreateInstance via windows-sys style call
        let hr = windows::Win32::System::Com::CoCreateInstance(
            &CLSID,
            None::<&windows::core::IUnknown>,
            windows::Win32::System::Com::CLSCTX_INPROC_SERVER,
        );

        match hr {
            Ok(unknown) => {
                let unknown: windows::core::IUnknown = unknown;
                // QueryInterface for IInputPanelConfiguration
                let result = unknown.query(&IID, &mut obj);
                if result.is_ok() && !obj.is_null() {
                    // IInputPanelConfiguration vtable:
                    // [0] QueryInterface [1] AddRef [2] Release
                    // [3] EnableFocusTracking() -> HRESULT
                    let vtable = *(obj as *const *const *const c_void);
                    let enable_fn: extern "system" fn(*mut c_void) -> windows::core::HRESULT =
                        std::mem::transmute(*vtable.add(3));
                    let result = enable_fn(obj);

                    if result.is_ok() {
                        log::info!("[TouchKeyboard] EnableFocusTracking succeeded");
                    } else {
                        log::warn!("[TouchKeyboard] EnableFocusTracking failed: {:?}", result);
                    }

                    // Release
                    let release: extern "system" fn(*mut c_void) -> u32 =
                        std::mem::transmute(*vtable.add(2));
                    release(obj);
                } else {
                    log::warn!("[TouchKeyboard] QueryInterface for IInputPanelConfiguration failed");
                }
            }
            Err(e) => {
                log::warn!("[TouchKeyboard] CoCreateInstance failed: {:?}", e);
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn enable_focus_tracking() {
    // No-op on non-Windows platforms
}
