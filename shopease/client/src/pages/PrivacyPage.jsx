import PolicyLayout from '../components/policy/PolicyLayout';
export default function PrivacyPage(){
  return <PolicyLayout title="Privacy Notice">
    <p>This notice explains what information BantayLog keeps, why, and who can see it. The barangay should review it against the Data Privacy Act of 2012 (Republic Act No. 10173) before adopting it.</p>
    <h2>1. Information we keep</h2>
    <ul>
      <li><strong>Account:</strong> your email address and password. Passwords are stored only as a protected one-way hash and cannot be read by anyone, including personnel.</li>
      <li><strong>Resident details:</strong> first, middle and last name, address, and optionally your birth date and contact number. We also record whether the barangay has verified these details.</li>
      <li><strong>Reports:</strong> title, category, description, location, area or purok, the date and time of the concern, and the report's status history and remarks.</li>
      <li><strong>Photos:</strong> up to three per report. Photos are converted to a standard format and resized, and hidden information such as camera details and GPS location is removed.</li>
      <li><strong>Sign-in session:</strong> a cookie that keeps you signed in for up to eight hours.</li>
      <li><strong>Password recovery:</strong> recovery requests are stored without readable reset codes, and codes expire after 15 minutes.</li>
    </ul>
    <h2>2. Why we use it</h2>
    <p>To receive and act on your reports, contact you about them, keep official barangay records, verify resident details, protect accounts, and publish reviewed community updates.</p>
    <h2>3. Who can see it</h2>
    <ul>
      <li><strong>You</strong> can see your own drafts, reports, photos, status history and remarks.</li>
      <li><strong>Barangay personnel</strong> (Staff, Secretary, Captain and Super Admin) can see submitted and cancelled reports, their photos, and resident records. They cannot see your private drafts or draft photos.</li>
      <li><strong>Other residents</strong> cannot see your reports or details. They see only community updates that personnel have reviewed and published.</li>
    </ul>
    <h2>4. Public community updates</h2>
    <p>A resolved private report is not published automatically. Personnel may write a separate public summary with a general location. Nothing from your report is copied automatically, including its text and photos. Personnel are asked to leave out names, contact details, home addresses and confidential allegations. This is a manual review by people, not an automatic filter.</p>
    <h2>5. Activity records</h2>
    <p>BantayLog records personnel actions, such as status changes, approvals and publication, with the role that acted and the record reference. It also records when residents submit or cancel reports, and when a resident's details are changed. These records do not copy report text, remarks or personal details.</p>
    <h2>6. Email</h2>
    <p>Password reset codes are sent through the barangay's Gmail account, so Google handles those email messages. BantayLog does not send other email.</p>
    <h2>7. How long we keep it</h2>
    <p>Submitted reports, cancelled reports, status history, blotter records and activity records are kept as barangay records. They have no delete feature. The Super Admin can delete a resident record only if it has no user account. How long records are retained is a decision for the barangay.</p>
    <h2>8. Where it is stored</h2>
    <p>BantayLog runs on a computer managed for the barangay and is used over a local network. It is not hosted on the public internet.</p>
    <h2>9. Your choices</h2>
    <ul>
      <li>You can update your resident details from your Profile. Doing so removes verification until the barangay checks the details again.</li>
      <li>To ask about, correct or withdraw information, contact the barangay hall.</li>
    </ul>
  </PolicyLayout>;
}
