import { Redirect } from 'expo-router';
export default function LegacySearch() { return <Redirect href={{ pathname: '/', params: { search: '1' } }} />; }
