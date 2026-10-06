import { Router } from 'express';
import { getAuthContext } from '../middleware/auth.js';
import { asyncHandler, throwSupabaseError } from '../middleware/error.js';

export const meRouter = Router();

meRouter.get('/', asyncHandler(async (req, res) => {
  const { sb, user } = getAuthContext(req);
  const { data: profile, error: profileError } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profileError) throwSupabaseError(profileError);

  const { data: participant, error: participantError } = await sb
    .from('participants').select('club_id').eq('user_id', user.id).maybeSingle();
  if (participantError) throwSupabaseError(participantError);

  let club = null;
  if (participant?.club_id) {
    const { data, error } = await sb.from('clubs').select('*').eq('id', participant.club_id).maybeSingle();
    if (error) throwSupabaseError(error);
    club = data;
  }
  res.json({ profile, club });
}));
