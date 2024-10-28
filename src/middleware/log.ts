import { UserAction } from '../../models/UserAction';

export const logAction = async (userId: number, action_type: string, formId: number, entityType: 'REDEEM' | 'FORM', ip: string | undefined, user_agent: string | undefined) => {
  try {
    await UserAction.create({
      user_id: userId,
      entity_type: entityType,
      action_type,
      form_id: formId,
      ip_address: ip,
      user_agent,
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
};