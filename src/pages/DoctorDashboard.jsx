/* Updated Dashboard with matching theme */
import React from 'react';

export default function DoctorDashboard() {
  return (
    <div className="p-8">
      <div className="dashboard-header p-6 rounded-2xl mb-8 text-white">
        <h1 className="text-3xl font-bold">Welcome to NACON MRS</h1>
        <p className="text-blue-100">Doctor Dashboard - Nigerian Army College of Nursing</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="font-semibold text-lg">Today's Patients</h3>
          <p className="text-5xl font-bold text-navy mt-4">24</p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-lg">Pending Reviews</h3>
          <p className="text-5xl font-bold text-navy mt-4">7</p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-lg">Active Cases</h3>
          <p className="text-5xl font-bold text-navy mt-4">12</p>
        </div>
      </div>
      
      {/* More content can be expanded later */}
    </div>
  );
}
