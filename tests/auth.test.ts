import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import { requestOtp, verifyOtp, getMyProfile, updateMyProfile, signOut } from '../lib/auth';

const PHONE = '+525500000001';
const CODE = '123456';
// GoTrue stores/returns phone numbers in E.164 digits without the leading
// "+" (confirmed against the local stack), so profiles.phone (copied from
// auth.users.phone by the handle_new_user trigger) comes back without it too.
const STORED_PHONE = '525500000001';

describe('phone OTP auth + profile self-service', () => {
  it('signs in via test OTP, auto-creates a profile, and updates notify_channel', async () => {
    expect((await requestOtp(PHONE)).error).toBeNull();
    expect((await verifyOtp(PHONE, CODE)).error).toBeNull();

    const profile = await getMyProfile();
    expect(profile).not.toBeNull();
    expect(profile!.role).toBe('bidder');            // trigger default
    expect(profile!.phone).toBe(STORED_PHONE);

    expect((await updateMyProfile({ notify_channel: 'sms' })).error).toBeNull();
    expect((await getMyProfile())!.notify_channel).toBe('sms');

    await signOut();
    expect(await getMyProfile()).toBeNull();          // no session → no profile
  });
});
