import { Alert, Platform } from 'react-native';
/** React Native Web does not implement Alert.alert. Keep confirmations functional there. */
export const appAlert: Pick<typeof Alert, 'alert'> = {
  alert(title, message, buttons) {
    if (Platform.OS !== 'web') return Alert.alert(title, message, buttons);
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length < 2) { window.alert(text); buttons?.[0]?.onPress?.(); return; }
    const action = buttons.find(button => button.style !== 'cancel');
    if (window.confirm(text)) action?.onPress?.();
    else buttons.find(button => button.style === 'cancel')?.onPress?.();
  },
};
