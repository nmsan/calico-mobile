import React, { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api';
import { useAuth } from '../auth';
import { BrandLockup } from '../brand';
import { colors } from '../theme';
import { Button, ErrorText, Input, ui } from '../ui';

export default function LoginScreen() {
  const { signIn, apiUrl, setApiUrl, signedOutReason } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(!apiUrl);
  // The server URL is built into the app, so the Server card stays hidden.
  // Long-press the CALICO wordmark to reveal it as an emergency override.
  const [serverUnlocked, setServerUnlocked] = useState(!apiUrl);
  const [url, setUrl] = useState(apiUrl);
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveServer() {
    setServerMsg(null);
    await setApiUrl(url);
    try {
      await api.ping();
      setServerMsg({ ok: true, text: 'Connected to the server.' });
      setShowServer(false);
    } catch (e) {
      setServerMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const canSubmit = !!username.trim() && pin.length >= 4 && !!apiUrl;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(username.trim(), pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 40 }}>
            <BrandLockup
              onLongPress={() => {
                setServerUnlocked(true);
                setShowServer(true);
              }}
            />
          </View>

          {signedOutReason && !error ? (
            <View style={{ backgroundColor: colors.lowBg, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: colors.low, fontSize: 14, lineHeight: 20 }}>You were signed out. {signedOutReason}</Text>
            </View>
          ) : null}
          <Input label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" returnKeyType="next" />
          <Input
            label="PIN"
            value={pin}
            onChangeText={(s) => setPin(s.replace(/\D/g, ''))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <ErrorText message={error} />
          <Button title="Sign in" onPress={submit} loading={busy} disabled={!canSubmit} style={{ marginTop: 6 }} />

          {serverUnlocked || !apiUrl ? (
            <View style={{ marginTop: 28, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 18 }}>
              <Pressable onPress={() => setShowServer((s) => !s)} style={ui.between} hitSlop={8}>
                <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 15 }}>Server</Text>
                <Text style={{ color: colors.rust, fontWeight: '600' }}>{showServer ? 'Hide' : apiUrl ? 'Change' : 'Set up'}</Text>
              </Pressable>
              {showServer ? (
                <View style={{ marginTop: 14 }}>
                  <Input
                    label="Apps Script web app URL"
                    value={url}
                    onChangeText={setUrl}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    autoCapitalize="none"
                  />
                  <Button title="Save and test" variant="secondary" onPress={saveServer} disabled={!url.startsWith('https://')} />
                </View>
              ) : null}
              {serverMsg ? (
                <Text style={{ marginTop: 10, color: serverMsg.ok ? colors.ok : colors.owed }}>{serverMsg.text}</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 10, letterSpacing: 2.6, marginTop: 48 }}>
            READY-MADE CLOTHING · MADE IN SRI LANKA
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
